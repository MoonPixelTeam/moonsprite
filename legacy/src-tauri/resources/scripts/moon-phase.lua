-- MoonSprite Lua example: create a small pixel-art moon phase animation.
-- The script creates a new sprite so the current project is left untouched.

local SIZE = 32
local CENTER = (SIZE - 1) / 2
local RADIUS = 13
local PHASE_COUNT = 8
local LIGHT = app.pixelColor.rgba(246, 216, 118, 255)
local SHADOW = app.pixelColor.rgba(56, 69, 98, 255)

local document = mse.document.info()
if document.colorMode ~= "rgba" then
  app.alert("The moon phase example requires an RGBA document.")
  return
end

local function draw_phase(image, progress)
  image:clear()
  for y = 0, SIZE - 1 do
    local dy = y - CENTER
    local row_width = math.sqrt(math.max(0, RADIUS * RADIUS - dy * dy))
    for x = 0, SIZE - 1 do
      local dx = x - CENTER
      local distance = dx * dx + dy * dy
      if distance <= RADIUS * RADIUS then
        local is_lit = dx >= math.cos(progress * math.pi) * row_width
        local is_outer_edge = distance >= (RADIUS - 1) * (RADIUS - 1)
        if is_lit then
          image:putPixel(x, y, LIGHT)
        elseif progress == 0 and is_outer_edge then
          image:putPixel(x, y, SHADOW)
        end
      end
    end
  end
end

local sprite = Sprite(SIZE, SIZE)
sprite.name = "Moon Phases"

app.transaction("Create moon phase animation", function()
  for phase = 1, PHASE_COUNT do
    local layer = phase == 1 and sprite.activeLayer or sprite:newLayer()
    layer.name = string.format("Moon Phase %d", phase)

    local image = Image(SIZE, SIZE, ColorMode.RGB)
    draw_phase(image, (phase - 1) / (PHASE_COUNT - 1))
    sprite:newCel(layer, phase, image)
  end
end)

print(string.format("Created %d moon phase frames in %s.", PHASE_COUNT, sprite.name))
