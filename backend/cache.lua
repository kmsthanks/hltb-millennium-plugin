local json = require("json")
local logger = require("logger")
local millennium = require("millennium")

local M = {}

-- Result cache constants
local CACHE_DURATION = 12 * 60 * 60 -- 12 hours (seconds)
local MAX_CACHE_AGE = 90 * 24 * 60 * 60 -- 90 days (seconds)
local MAX_CACHE_ENTRIES = 2000
local PRUNE_INTERVAL = 50

-- In-memory stores
local result_cache = {} -- { [app_id] = { data, timestamp, notFound } }
local id_cache = { mappings = {}, metadata = {} } -- { mappings = { [steam_id] = hltb_id }, metadata = { timestamp, steamUserId } }
local write_count = 0

-- File paths

local function get_cache_path()
    return millennium.get_install_path() .. "/cache.json"
end

local function get_id_cache_path()
    return millennium.get_install_path() .. "/id_cache.json"
end

-- File I/O helpers

local function read_json_file(path)
    local file = io.open(path, "r")
    if not file then return nil end

    local content = file:read("*a")
    file:close()

    local ok, parsed = pcall(json.decode, content)
    if not ok or type(parsed) ~= "table" then
        return nil
    end

    return parsed
end

local function write_json_file(path, data)
    local file, err = io.open(path, "w")
    if not file then
        logger:error("Failed to write " .. path .. ": " .. (err or "unknown"))
        return false
    end

    file:write(json.encode(data))
    file:close()
    return true
end

-- Result cache

local function prune_result_cache()
    local now = os.time()
    local entries = {}

    for app_id, entry in pairs(result_cache) do
        if now - entry.timestamp < MAX_CACHE_AGE then
            table.insert(entries, { app_id = app_id, entry = entry })
        end
    end

    if #entries > MAX_CACHE_ENTRIES then
        table.sort(entries, function(a, b)
            return a.entry.timestamp > b.entry.timestamp -- newest first
        end)

        result_cache = {}
        for i = 1, MAX_CACHE_ENTRIES do
            result_cache[entries[i].app_id] = entries[i].entry
        end
        logger:info("Pruned cache to " .. MAX_CACHE_ENTRIES .. " entries")
    else
        result_cache = {}
        for _, e in ipairs(entries) do
            result_cache[e.app_id] = e.entry
        end
    end
end

function M.get(app_id)
    local entry = result_cache[app_id]
    if not entry then return nil end

    local age = os.time() - entry.timestamp

    -- Hard expiry
    if age > MAX_CACHE_AGE then
        result_cache[app_id] = nil
        return nil
    end

    local is_stale = age > CACHE_DURATION
    return entry, is_stale
end

function M.set(app_id, data)
    result_cache[app_id] = {
        data = data,
        timestamp = os.time(),
        notFound = data == nil,
    }

    write_count = write_count + 1
    if write_count >= PRUNE_INTERVAL then
        write_count = 0
        prune_result_cache()
    end

    M.save_result_cache()
end

function M.clear()
    result_cache = {}
    write_count = 0
    os.remove(get_cache_path())
    logger:info("Result cache cleared")
end

function M.stats()
    local count = 0
    local oldest = nil

    for _, entry in pairs(result_cache) do
        count = count + 1
        if oldest == nil or entry.timestamp < oldest then
            oldest = entry.timestamp
        end
    end

    return { count = count, oldestTimestamp = oldest }
end

-- ID cache

function M.get_hltb_id(app_id)
    return id_cache.mappings[app_id]
end

function M.set_id_mappings(mappings, steam_user_id)
    local store = {}
    for _, mapping in ipairs(mappings) do
        if mapping.steam_id and mapping.hltb_id and mapping.hltb_id ~= 0 then
            store[mapping.steam_id] = mapping.hltb_id
        end
    end

    id_cache = {
        mappings = store,
        metadata = {
            timestamp = os.time(),
            steamUserId = steam_user_id,
        },
    }

    M.save_id_cache()
    local count = 0
    for _ in pairs(store) do count = count + 1 end
    logger:info("ID cache updated with " .. count .. " mappings")
end

function M.clear_id_cache()
    id_cache = { mappings = {}, metadata = {} }
    os.remove(get_id_cache_path())
    logger:info("ID cache cleared")
end

function M.id_cache_stats()
    local count = 0
    for _ in pairs(id_cache.mappings) do count = count + 1 end

    local age_seconds = nil
    if id_cache.metadata.timestamp then
        age_seconds = os.time() - id_cache.metadata.timestamp
    end

    return {
        count = count,
        steamUserId = id_cache.metadata.steamUserId or nil,
        ageSeconds = age_seconds,
    }
end

function M.is_id_cache_valid(steam_user_id)
    if not id_cache.metadata.steamUserId then return false end
    if id_cache.metadata.steamUserId ~= steam_user_id then return false end

    local count = 0
    for _ in pairs(id_cache.mappings) do count = count + 1 end
    return count > 0
end

-- Persistence

function M.save_result_cache()
    write_json_file(get_cache_path(), result_cache)
end

function M.save_id_cache()
    write_json_file(get_id_cache_path(), id_cache)
end

function M.load()
    -- Load result cache
    local cached = read_json_file(get_cache_path())
    if cached then
        -- Convert string keys back to numbers
        result_cache = {}
        for k, v in pairs(cached) do
            local num_key = tonumber(k)
            if num_key and type(v) == "table" and v.timestamp then
                result_cache[num_key] = v
            end
        end
        local count = 0
        for _ in pairs(result_cache) do count = count + 1 end
        logger:info("Loaded " .. count .. " result cache entries")
    end

    -- Load ID cache
    local id_data = read_json_file(get_id_cache_path())
    if id_data and type(id_data.mappings) == "table" and type(id_data.metadata) == "table" then
        -- Convert string keys back to numbers
        local mappings = {}
        for k, v in pairs(id_data.mappings) do
            local num_key = tonumber(k)
            if num_key then
                mappings[num_key] = v
            end
        end
        id_cache = {
            mappings = mappings,
            metadata = id_data.metadata,
        }
        local count = 0
        for _ in pairs(mappings) do count = count + 1 end
        logger:info("Loaded " .. count .. " ID cache mappings")
    end
end

return M
