--[[
    HLTB API Client

    Handles authenticated requests to HLTB's API.
    Provides search and game data fetching functionality.
]]

local http = require("http")
local json = require("json")
local logger = require("logger")
local endpoints = require("hltb_endpoint_discovery")

local M = {}

M.TOKEN_TTL = 300    -- Auth token cache duration in seconds
M.SEARCH_SIZE = 20   -- Number of results to request per search

-- Exposed for testing; defaults to real http module
M._http = http

-- Auth struct cache: { token, key, value }
local cached_auth = nil
local auth_expires_at = 0

-- Get auth struct (token + key/value pair)
function M.get_auth(force_refresh)
    local now = os.time()

    if not force_refresh and cached_auth and now < auth_expires_at then
        return cached_auth, nil
    end

    local timestamp_ms = math.floor(now * 1000)
    local url = endpoints.get_init_url() .. "?t=" .. timestamp_ms
    logger:info("Fetching auth token...")

    local response, err = http.get(url, {
        headers = {
            ["User-Agent"] = endpoints.USER_AGENT,
            ["referer"] = endpoints.REFERER_HEADER
        },
        timeout = endpoints.TIMEOUT
    })

    if not response then
        return nil, "Request failed: " .. (err or "unknown")
    end

    if response.status ~= 200 then
        return nil, "HTTP " .. response.status
    end

    local success, data = pcall(json.decode, response.body)
    if not success or not data then
        return nil, "Invalid JSON response"
    end

    if not data.token then
        return nil, "No token in response"
    end

    cached_auth = {
        token = data.token,
        key = data.hpKey,
        value = data.hpVal
    }
    auth_expires_at = now + M.TOKEN_TTL
    logger:info("Got auth token" .. (data.hpKey and " with key/value" or ""))

    return cached_auth, nil
end

-- Build search payload matching HLTB's expected API format.
-- The searchOptions structure mirrors what the HLTB website sends.
local function get_search_request_data(game_name, modifier, page, auth)
    modifier = modifier or ""
    page = page or 1

    local search_terms = {}
    for word in game_name:gmatch("%S+") do
        table.insert(search_terms, word)
    end

    local payload = {
        searchType = "games",
        searchTerms = search_terms,
        searchPage = page,
        size = M.SEARCH_SIZE,
        searchOptions = {
            games = {
                userId = 0,
                platform = "",
                sortCategory = "popular",
                rangeCategory = "main",
                rangeTime = { min = 0, max = 0 },
                gameplay = {
                    perspective = "",
                    flow = "",
                    genre = "",
                    difficulty = ""
                },
                rangeYear = { max = "", min = "" },
                modifier = modifier
            },
            users = { sortCategory = "postcount" },
            lists = { sortCategory = "follows" },
            filter = "",
            sort = 0,
            randomizer = 0
        },
        useCache = true
    }

    -- Include auth key/value in the payload body
    if auth and auth.key and auth.value then
        payload[tostring(auth.key)] = auth.value
    end

    return json.encode(payload)
end

-- Build search headers
local function get_search_request_headers(auth)
    local headers = {
        ["Content-Type"] = "application/json",
        ["Origin"] = "https://howlongtobeat.com",
        ["Referer"] = "https://howlongtobeat.com/",
        ["Authority"] = "howlongtobeat.com",
        ["User-Agent"] = endpoints.USER_AGENT
    }

    if auth then
        headers["x-auth-token"] = auth.token
        if auth.key then
            headers["x-hp-key"] = tostring(auth.key)
        end
        if auth.value then
            headers["x-hp-val"] = tostring(auth.value)
        end
    end

    return headers
end

-- Search HLTB
function M.search(query, options)
    options = options or {}
    local page = options.page or 1
    local modifier = options.modifier or ""

    local auth, auth_err = M.get_auth()
    if not auth then
        logger:info("Failed to get auth: " .. (auth_err or "unknown"))
        return nil
    end

    local headers = get_search_request_headers(auth)
    local search_url = endpoints.get_search_url()
    local payload = get_search_request_data(query, modifier, page, auth)

    local response, err = http.request(search_url, {
        method = "POST",
        headers = headers,
        data = payload,
        timeout = endpoints.TIMEOUT
    })

    if not response then
        logger:info("Search request failed: " .. (err or "unknown"))
        return nil
    end

    -- Retry once on 403 with a fresh token (HLTB expires tokens server-side)
    if response.status == 403 then
        logger:info("Search returned 403, refreshing auth and retrying...")
        auth, auth_err = M.get_auth(true)
        if not auth then
            logger:info("Failed to refresh auth: " .. (auth_err or "unknown"))
            return nil
        end
        headers = get_search_request_headers(auth)
        payload = get_search_request_data(query, modifier, page, auth)
        response, err = http.request(search_url, {
            method = "POST",
            headers = headers,
            data = payload,
            timeout = endpoints.TIMEOUT
        })
        if not response then
            logger:info("Search retry failed: " .. (err or "unknown"))
            return nil
        end
    end

    if response.status ~= 200 then
        logger:info("Search returned HTTP " .. response.status)
        return nil
    end

    local success, data = pcall(json.decode, response.body)
    if not success or not data then
        logger:info("Invalid JSON response for search")
        return nil
    end

    if type(data.data) ~= "table" then
        logger:info("Unexpected JSON data for search results: data is not array")
        return nil
    end

    -- Validate each item has required fields
    for _, item in ipairs(data.data) do
        if type(item.game_id) ~= "number" then
            logger:info("Unexpected JSON data for search results: game_id is not number")
            return nil
        end
        if type(item.game_name) ~= "string" then
            logger:info("Unexpected JSON data for search results: game_name is not string")
            return nil
        end
        if type(item.comp_all_count) ~= "number" then
            logger:info("Unexpected JSON data for search results: comp_all_count is not number")
            return nil
        end
    end

    return data
end

-- Fetch game data by game ID (for Steam ID verification)
function M.fetch_game_data(game_id)
    local build_id = endpoints.get_build_id()
    if not build_id then
        return nil
    end

    local url = endpoints.BASE_URL .. "_next/data/" .. build_id .. "/game/" .. game_id .. ".json"
    logger:info("Fetching game data: " .. url)

    local headers = {
        ["User-Agent"] = endpoints.USER_AGENT,
        ["referer"] = endpoints.REFERER_HEADER
    }

    local response, err = http.get(url, {
        headers = headers,
        timeout = endpoints.TIMEOUT
    })

    if not response then
        logger:info("Game data request failed: " .. (err or "unknown"))
        return nil
    end

    if response.status ~= 200 then
        logger:info("Game data request returned HTTP " .. response.status)
        return nil
    end

    local success, data = pcall(json.decode, response.body)
    if not success or not data then
        logger:info("Invalid JSON response for game data")
        return nil
    end

    -- Validate structure: pageProps.game.data.game must be array
    if type(data.pageProps) ~= "table" then
        logger:info("Unexpected JSON data for game page: no pageProps")
        return nil
    end

    if type(data.pageProps.game) ~= "table" then
        logger:info("Unexpected JSON data for game page: no game")
        return nil
    end

    if type(data.pageProps.game.data) ~= "table" then
        logger:info("Unexpected JSON data for game page: no data")
        return nil
    end

    local game_array = data.pageProps.game.data.game
    if type(game_array) ~= "table" then
        logger:info("Unexpected JSON data for game page: game is not array")
        return nil
    end

    if #game_array ~= 1 then
        logger:info("Unexpected JSON data for game page: game array length is " .. #game_array)
        return nil
    end

    local game_data = game_array[1]

    -- Only validate profile_steam since that's all we use from this endpoint
    if type(game_data.profile_steam) ~= "number" then
        logger:info("Unexpected JSON data: profile_steam has wrong type")
        return nil
    end

    return game_data
end

-- Fetch Steam import data from HLTB's Steam integration API.
--
-- HLTB provides an endpoint that returns all games in a user's Steam library
-- along with their corresponding HLTB game IDs. This gives us a reliable
-- mapping without needing to do fuzzy name matching.
--
-- Requires the user's Steam profile to be public. Returns nil if the profile
-- is private or the request fails.
--
-- API endpoint: POST https://howlongtobeat.com/api/steam/getSteamImportData
-- Returns: Array of game objects with steam_id, hltb_id, and other metadata.
function M.fetch_steam_import(steam_user_id)
    if not steam_user_id or steam_user_id == "" then
        return nil, "No Steam user ID provided"
    end

    logger:info("Fetching Steam import for user: " .. steam_user_id)

    local url = endpoints.BASE_URL .. "api/steam/getSteamImportData"

    local payload = json.encode({
        steamUserId = steam_user_id,
        steamOmitData = 0
    })

    local headers = {
        ["Content-Type"] = "application/json",
        ["User-Agent"] = endpoints.USER_AGENT,
        ["Referer"] = endpoints.REFERER_HEADER
    }

    local response, err = M._http.request(url, {
        method = "POST",
        headers = headers,
        data = payload,
        timeout = endpoints.TIMEOUT
    })

    if not response then
        return nil, "Request failed: " .. (err or "unknown")
    end

    if response.status ~= 200 then
        return nil, "HTTP " .. response.status
    end

    local success, data = pcall(json.decode, response.body)
    if not success or type(data) ~= "table" then
        return nil, "Invalid JSON response"
    end

    if data.error then
        return nil, "HLTB API error: " .. data.error .. " (profile may be private)"
    end

    if type(data.games) ~= "table" then
        return nil, "No games in response (profile may be private)"
    end

    logger:info("Steam import returned " .. #data.games .. " games")
    return data.games, nil
end

-- Fetch game completion times directly by HLTB game ID.
--
-- Uses HLTB's NextJS data endpoint to get full game details including
-- completion times (main, main+extras, completionist).
--
-- This is faster and more reliable than name-based search when we already
-- know the HLTB game ID (e.g., from the Steam import cache).
--
-- API endpoint: GET https://howlongtobeat.com/_next/data/{buildId}/game/{gameId}.json
-- Returns: Normalized game data with game_id, game_name, comp_main, comp_plus, comp_100.
function M.fetch_game_by_id(game_id)
    if not game_id then
        return nil, "No game ID provided"
    end

    logger:info("Fetching game data for HLTB ID: " .. tostring(game_id))

    local build_id = endpoints.get_build_id()
    if not build_id then
        return nil, "Could not get build ID"
    end

    local url = endpoints.BASE_URL .. "_next/data/" .. build_id .. "/game/" .. game_id .. ".json"

    local headers = {
        ["User-Agent"] = endpoints.USER_AGENT,
        ["referer"] = endpoints.REFERER_HEADER
    }

    local response, err = M._http.get(url, {
        headers = headers,
        timeout = endpoints.TIMEOUT
    })

    if not response then
        return nil, "Request failed: " .. (err or "unknown")
    end

    if response.status ~= 200 then
        return nil, "HTTP " .. response.status
    end

    local success, data = pcall(json.decode, response.body)
    if not success or type(data) ~= "table" then
        return nil, "Invalid JSON response"
    end

    -- Navigate to the game data
    if type(data.pageProps) ~= "table" or
       type(data.pageProps.game) ~= "table" or
       type(data.pageProps.game.data) ~= "table" then
        return nil, "Unexpected response structure"
    end

    local game_array = data.pageProps.game.data.game
    if type(game_array) ~= "table" or #game_array == 0 then
        return nil, "No game data found"
    end

    local game = game_array[1]

    -- Return normalized game data matching search result format
    return {
        game_id = game.game_id,
        game_name = game.game_name,
        comp_main = game.comp_main,
        comp_plus = game.comp_plus,
        comp_100 = game.comp_100
    }, nil
end

-- Clear cached auth
function M.clear_cache()
    cached_auth = nil
    auth_expires_at = 0
end

return M
