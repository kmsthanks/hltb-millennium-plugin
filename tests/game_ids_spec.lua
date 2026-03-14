--[[
    Game IDs Validation Tests

    Ensures game_ids.lua is valid Lua and contains proper mappings.

    Run with: busted tests/
]]

package.path = package.path .. ";backend/?.lua"

describe("game_ids.lua", function()
    local game_ids
    local file_content

    -- Read file content for duplicate detection
    setup(function()
        local file = io.open("backend/game_ids.lua", "r")
        if file then
            file_content = file:read("*all")
            file:close()
        end
    end)

    it("loads without syntax errors", function()
        local ok, result = pcall(require, "game_ids")
        assert.is_true(ok, "Failed to load game_ids.lua: " .. tostring(result))
        game_ids = result
    end)

    it("returns a table", function()
        assert.is_table(game_ids, "game_ids.lua should return a table")
    end)

    it("contains only number keys (AppIDs) and number values (HLTB IDs)", function()
        for key, value in pairs(game_ids) do
            assert.is_number(key, "Key should be a number (AppID): " .. tostring(key))
            assert.is_number(value, "Value should be a number (HLTB ID) for AppID: " .. tostring(key))
        end
    end)

    it("has no zero or negative values", function()
        for key, value in pairs(game_ids) do
            assert.is_true(value > 0, "HLTB ID should be positive for AppID: " .. tostring(key))
        end
    end)

    it("has no duplicate keys", function()
        assert.is_not_nil(file_content, "Could not read game_ids.lua")

        local keys_seen = {}
        local duplicates = {}

        -- Match keys in the format [12345]
        for key in file_content:gmatch('%[(%d+)%]%s*=') do
            if keys_seen[key] then
                table.insert(duplicates, key)
            else
                keys_seen[key] = true
            end
        end

        assert.are_equal(0, #duplicates,
            "Duplicate AppIDs found: " .. table.concat(duplicates, ", "))
    end)

    it("has keys in numerical order", function()
        assert.is_not_nil(file_content, "Could not read game_ids.lua")

        local keys = {}
        for key in file_content:gmatch('%[(%d+)%]%s*=') do
            table.insert(keys, tonumber(key))
        end

        for i = 2, #keys do
            local prev, curr = keys[i-1], keys[i]
            assert.is_true(prev <= curr,
                "AppIDs not sorted: " .. tostring(prev) .. " should come before " .. tostring(curr))
        end
    end)

    it("every entry has a comment with the HLTB game name", function()
        assert.is_not_nil(file_content, "Could not read game_ids.lua")

        local missing = {}
        for line in file_content:gmatch("[^\n]+") do
            local app_id = line:match("^%s*%[(%d+)%]%s*=")
            if app_id then
                if not line:match("%-%-") then
                    table.insert(missing, app_id)
                end
            end
        end

        assert.are_equal(0, #missing,
            "Entries missing HLTB name comment: " .. table.concat(missing, ", "))
    end)
end)
