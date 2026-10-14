-- MSE API 0.2.0：查询结构快照，并在一个可撤销事务中修改工程。
-- app.* 用于兼容 Aseprite 脚本；mse.* 是 MoonSprite 专属接口。

local document = mse.document.info()
local layers = mse.layers.list()

print(string.format(
  "%s (%dx%d, %s), frame %d, %d layers",
  document.name,
  document.width,
  document.height,
  document.colorMode,
  document.frame,
  #layers
))

if #layers == 0 then
  return
end

app.transaction("MSE API example", function()
  mse.layers.update(layers[1].id, {
    name = layers[1].name .. " (Lua)",
    opacity = 224
  })

  mse.selection.set {
    x = 0,
    y = 0,
    width = math.min(16, document.width),
    height = math.min(16, document.height)
  }
end)

mse.ui.notify("MSE example applied; use Undo to revert it.")
