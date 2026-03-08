--[[
    Settings RPC Wrapper Tests

    Tests for GetSettings and SaveSettings in main.lua.
    Mocks the settings module to test RPC logic in isolation.

    Run with: busted tests/settings_rpc_spec.lua
]]

package.path = package.path .. ";backend/?.lua"

local json = require("dkjson")

-- Mock all dependencies that main.lua requires
package.loaded["json"] = json
package.loaded["logger"] = {
    info = function() end,
    error = function() end,
}
package.loaded["millennium"] = {
    version = function() return "test" end,
    ready = function() end,
    get_install_path = function() return "/mock/path" end,
}
package.loaded["http"] = {
    get = function() return nil, "No mock configured" end,
    request = function() return nil, "No mock configured" end,
}
package.loaded["hltb_endpoint_discovery"] = {
    BASE_URL = "https://howlongtobeat.com/",
    USER_AGENT = "test",
    REFERER_HEADER = "https://howlongtobeat.com/",
    TIMEOUT = 10,
    get_build_id = function() return "test" end,
}

-- Mock settings module (replaced per-test)
local mock_settings = {
    load = function() return {} end,
    save = function() return true end,
    merge_defaults = function(s) return s end,
}
package.loaded["settings"] = mock_settings

-- Mock cache module
package.loaded["cache"] = {
    load = function() end,
    get = function() return nil end,
    set = function() end,
    clear = function() end,
    clear_id_cache = function() end,
    stats = function() return { count = 0, oldestTimestamp = nil } end,
    id_cache_stats = function() return { count = 0, steamUserId = nil, ageSeconds = nil } end,
    get_hltb_id = function() return nil end,
    set_id_mappings = function() end,
    is_id_cache_valid = function() return false end,
}

-- Load main module (this defines GetSettings/SaveSettings as globals)
package.loaded["main"] = nil
local main = require("main")

describe("GetSettings RPC", function()
    it("returns settings as JSON on success", function()
        mock_settings.load = function()
            return { showInLibrary = true, showInStore = false }
        end

        local result_json = main.GetSettings()
        local result = json.decode(result_json)
        assert.is_true(result.success)
        assert.equals(true, result.data.showInLibrary)
        assert.equals(false, result.data.showInStore)
    end)

    it("returns error JSON when load throws", function()
        mock_settings.load = function()
            error("disk read error")
        end

        local result_json = main.GetSettings()
        local result = json.decode(result_json)
        assert.is_false(result.success)
        assert.is_not_nil(result.error)
        assert.matches("disk read error", result.error)
    end)
end)

describe("SaveSettings RPC", function()
    it("returns success for valid JSON input", function()
        local saved_data
        mock_settings.merge_defaults = function(s) return s end
        mock_settings.save = function(s)
            saved_data = s
            return true
        end

        local input = json.encode({ showInLibrary = false, showInStore = true })
        local result_json = main.SaveSettings(input)
        local result = json.decode(result_json)
        assert.is_true(result.success)
        assert.equals(false, saved_data.showInLibrary)
        assert.equals(true, saved_data.showInStore)
    end)

    it("returns error for non-table JSON input", function()
        local result_json = main.SaveSettings('"just a string"')
        local result = json.decode(result_json)
        assert.is_false(result.success)
        assert.equals("Invalid settings", result.error)
    end)

    it("returns error when save fails", function()
        mock_settings.merge_defaults = function(s) return s end
        mock_settings.save = function() return false end

        local input = json.encode({ showInLibrary = true })
        local result_json = main.SaveSettings(input)
        local result = json.decode(result_json)
        assert.is_false(result.success)
        assert.equals("Failed to write settings file", result.error)
    end)

    it("returns error JSON when input is invalid JSON", function()
        local result_json = main.SaveSettings("not json{{{")
        local result = json.decode(result_json)
        assert.is_false(result.success)
        assert.is_not_nil(result.error)
    end)
end)
