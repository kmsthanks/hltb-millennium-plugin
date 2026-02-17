--[[
    HLTB for Millennium - Plugin Entry Point

    Displays How Long To Beat completion times on Steam game pages.
]]

local logger = require("logger")
local millennium = require("millennium")
local json = require("json")
local hltb = require("hltb")
local steam = require("steam")
local steamhunters = require("steamhunters")
local utils = require("hltb_utils")
local name_fixes = require("name_fixes")

-- Get game name with optional fallback sources
local function get_game_name(app_id)
    -- 1. Try first-party Steam API
    local name, err = steam.get_game_name(app_id)
    if name then 
        return name 
    end

    logger:info("Steam API failed for " .. tostring(app_id) .. ": " .. (err or "unknown") .. ". Trying fallback...")

    -- 2. Fall back to SteamHunters
    local sh_name, sh_err = steamhunters.get_game_name(app_id)
    if sh_name then
        logger:info("Fallback successful: Found via SteamHunters")
        return sh_name
    end
    
    return nil, "All sources failed. Steam: " .. (err or "nil") .. ", SH: " .. (sh_err or "nil")
end

-- Main function called by frontend
function GetHltbData(app_id, fallback_name)
    local success, result = pcall(function()
        logger:info("GetHltbData called for app_id: " .. tostring(app_id))

        -- Check for AppID-based name fix first
        local fixed_name = name_fixes[app_id]
        local search_name

        if fixed_name then
            logger:info("Name fix (AppID " .. tostring(app_id) .. "): " .. fixed_name)
            search_name = fixed_name
        else
            -- No fix, get name from Steam
            local game_name, name_err = get_game_name(app_id)
            if not game_name then
                -- Fall back to UI-provided name (e.g. for non-Steam games)
                if fallback_name and fallback_name ~= "" then
                    logger:info("Using fallback name from UI: " .. fallback_name)
                    game_name = fallback_name
                else
                    logger:error("Could not get game name: " .. (name_err or "unknown"))
                    return json.encode({ success = false, error = "Could not get game name" })
                end
            end

            logger:info("Raw name: " .. game_name)

            -- Sanitize (removes ™, ®, etc.)
            search_name = utils.sanitize_game_name(game_name)
            if search_name ~= game_name then
                logger:info("Sanitized: " .. search_name)
            end
        end

        -- Search HLTB
        local match = hltb.search_best_match(search_name, app_id)
        if not match then
            logger:info("No HLTB results for: " .. search_name)
            return json.encode({
                success = true,
                data = { searched_name = search_name }
            })
        end

        local similarity = utils.calculate_similarity(search_name, match.game_name)
        logger:info("Found match: " .. (match.game_name or "unknown") .. " (id: " .. tostring(match.game_id) .. ", similarity: " .. tostring(similarity) .. ")")

        return json.encode({
            success = true,
            data = {
                searched_name = search_name,
                game_id = match.game_id,
                game_name = match.game_name,
                comp_main = utils.seconds_to_hours(match.comp_main),
                comp_plus = utils.seconds_to_hours(match.comp_plus),
                comp_100 = utils.seconds_to_hours(match.comp_100)
            }
        })
    end)

    if not success then
        logger:error("GetHltbData error: " .. tostring(result))
        return json.encode({ success = false, error = tostring(result) })
    end

    return result
end

-- Fetch Steam import data from HLTB's Steam integration API.
--
-- For users with public Steam profiles, HLTB provides a direct mapping of
-- Steam app IDs to HLTB game IDs. This is more reliable than name-based
-- search since it avoids issues with mismatched or localized game names.
--
-- Called by frontend at startup to pre-populate the ID cache.
-- Returns an array of { steam_id, hltb_id } mappings.
function FetchSteamImport(steam_user_id)
    local success, result = pcall(function()
        logger:info("FetchSteamImport called for user: " .. tostring(steam_user_id))

        local games, err = hltb.fetch_steam_import(steam_user_id)
        if not games then
            logger:info("Steam import failed: " .. (err or "unknown"))
            return json.encode({ success = false, error = err or "Unknown error" })
        end

        -- Extract just the steam_id -> hltb_id mappings
        local mappings = {}
        for _, game in ipairs(games) do
            if game.steam_id and game.hltb_id and game.hltb_id ~= 0 then
                table.insert(mappings, {
                    steam_id = game.steam_id,
                    hltb_id = game.hltb_id
                })
            end
        end

        logger:info("Returning " .. #mappings .. " ID mappings")
        return json.encode({
            success = true,
            data = mappings
        })
    end)

    if not success then
        logger:error("FetchSteamImport error: " .. tostring(result))
        return json.encode({ success = false, error = tostring(result) })
    end

    return result
end

-- Fetch HLTB completion times directly by HLTB game ID.
--
-- This is the fast path used when we have a cached ID mapping from the
-- Steam import. Skips name-based search entirely, guaranteeing the correct
-- game match.
--
-- Still fetches the Steam game name for logging, so we can verify the
-- mapping is correct in the logs.
--
-- Parameters are ordered alphabetically to match Millennium's callable binding.
function GetHltbDataById(app_id, hltb_id)
    local success, result = pcall(function()
        logger:info("GetHltbDataById called for app_id: " .. tostring(app_id))

        -- Get Steam name for logging
        local game_name, name_err = get_game_name(app_id)
        if game_name then
            logger:info("Raw name: " .. game_name)
        else
            logger:info("Could not get Steam name: " .. (name_err or "unknown"))
        end

        local match, err = hltb.fetch_game_by_id(hltb_id)
        if not match then
            logger:info("Fetch by ID failed: " .. (err or "unknown"))
            return json.encode({ success = false, error = err or "Unknown error" })
        end

        logger:info("Found game: " .. (match.game_name or "unknown"))

        return json.encode({
            success = true,
            data = {
                game_id = match.game_id,
                game_name = match.game_name,
                comp_main = utils.seconds_to_hours(match.comp_main),
                comp_plus = utils.seconds_to_hours(match.comp_plus),
                comp_100 = utils.seconds_to_hours(match.comp_100)
            }
        })
    end)

    if not success then
        logger:error("GetHltbDataById error: " .. tostring(result))
        return json.encode({ success = false, error = tostring(result) })
    end

    return result
end

-- Plugin lifecycle
local function on_load()
    logger:info("HLTB plugin loaded, Millennium " .. millennium.version())
    millennium.ready()
end

local function on_frontend_loaded()
    logger:info("HLTB: Frontend loaded")
end

local function on_unload()
    logger:info("HLTB plugin unloaded")
end

return {
    on_load = on_load,
    on_frontend_loaded = on_frontend_loaded,
    on_unload = on_unload,
    GetHltbData = GetHltbData,
    FetchSteamImport = FetchSteamImport,
    GetHltbDataById = GetHltbDataById
}
