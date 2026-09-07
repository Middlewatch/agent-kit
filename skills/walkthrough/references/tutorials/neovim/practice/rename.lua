---@param quantity number
---@param unit_price number
---@return number
local function line_total(quantity, unit_price)
	return quantity * unit_price
end

local materials = line_total(12, 8)
local labour = line_total(3, 45)
local label = "line_total"

print(materials + labour, label)
