--!strict
-- World (ModuleScript dans ServerScriptService > Systems)
-- Génère la carte en Terrain Roblox au lancement du serveur :
--  1) Deux bruits de Perlin (math.noise) : ALTITUDE et HUMIDITÉ. Chaque point (x, z) de la carte
--     a donc une altitude et une humidité entre 0 et 1.
--  2) On en déduit le BIOME : eau (lacs, mer), plage, marais, collines rocheuses, forêt
--     (avec clairières), plaine. Le centre est aplati : c'est la zone de départ.
--  3) On "peint" le Terrain par morceaux de 64x64 studs avec Terrain:WriteVoxels (rapide),
--     en faisant une pause entre deux morceaux (pas de gel du serveur).
-- Resources et Enemies demandent ensuite World.sample(x, z) pour savoir quel biome est où.
-- La graine (Seed) est affichée dans l'Output : remets-la dans Config.World.Seed pour revoir
-- exactement la même carte.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Config"))

export type Biome = "Water" | "Beach" | "Marsh" | "Rocky" | "Forest" | "Clearing" | "Plains"

export type Sample = {
	height: number, -- hauteur du sol (studs)
	biome: Biome,
	material: Enum.Material,
	depth: number, -- 0 = bord du biome, 1 = au cœur (sert aux densités progressives)
	cluster: boolean, -- zone rocheuse : groupe de rochers
	path: boolean, -- chemin : pas de végétation
	distance: number, -- distance au centre de la carte
}

local World = {}

local W = Config.World
local VOXEL = 4 -- résolution du Terrain (obligatoirement 4)
local CHUNK = 64 -- taille d'un morceau généré d'un coup
local TOP = 112 -- plafond de la zone générée

local seed = 0
local offsets: { number } = {}
local generated = false

local function smoothstep(a: number, b: number, x: number): number
	local t = math.clamp((x - a) / (b - a), 0, 1)
	return t * t * (3 - 2 * t)
end

-- Bruit de Perlin "fractal" (3 couches de détails), ramené entre 0 et 1.
-- `layer` choisit un décalage différent pour avoir des bruits indépendants.
local function fbm(x: number, z: number, scale: number, layer: number): number
	local ox, oz = offsets[layer * 2 - 1], offsets[layer * 2]
	local total, amplitude, frequency, norm = 0, 1, 1 / scale, 0
	for _ = 1, 3 do
		total += math.noise(x * frequency + ox, z * frequency + oz) * amplitude
		norm += amplitude
		amplitude *= 0.5
		frequency *= 2
	end
	return math.clamp(total / norm * 1.2 + 0.5, 0, 1)
end

-- Altitude et humidité brutes (0-1) après le masque d'île et l'aplatissement du centre.
local function climate(x: number, z: number): (number, number, number)
	local d = math.sqrt(x * x + z * z)
	local island = 1 - smoothstep(W.MapRadius * 0.82, W.MapRadius, d)
	local e = fbm(x, z, W.ElevationScale, 1)
	local m = fbm(x, z, W.MoistureScale, 2)
	e = e * (0.4 + 0.6 * island) - (1 - island) * 0.3
	-- Centre : plaine plate et sûre.
	local f = smoothstep(W.ClearRadius, W.FlattenRadius, d)
	e = 0.47 + (e - 0.47) * f
	m = 0.38 + (m - 0.38) * f
	return e, m, d
end

local function heightFrom(e: number, x: number, z: number, d: number): number
	local h
	if e < W.WaterE then
		h = W.WaterLevel - 1 - (W.WaterE - e) * W.HeightScale * 1.5
	else
		h = W.WaterLevel + 1 + (e - W.WaterE) * W.HeightScale
		if e > W.RockE - 0.04 then
			-- Collines : relief en plus, avec un peu de bruit pour les crêtes.
			local hill = smoothstep(W.RockE - 0.04, 1, e)
			h += hill * W.HillBoost * (0.7 + 0.6 * fbm(x, z, 40, 4))
		end
	end
	local f = smoothstep(W.ClearRadius, W.FlattenRadius, d)
	h = W.SpawnHeight + (h - W.SpawnHeight) * f
	return math.max(h, W.TerrainBottom + 6)
end

function World.heightAt(x: number, z: number): number
	local e, _, d = climate(x, z)
	return heightFrom(e, x, z, d)
end

function World.sample(x: number, z: number): Sample
	local e, m, d = climate(x, z)
	local h = heightFrom(e, x, z, d)
	local s: Sample = {
		height = h,
		biome = "Plains",
		material = Enum.Material.Grass,
		depth = 0,
		cluster = false,
		path = false,
		distance = d,
	}
	if e < W.WaterE then
		s.biome = "Water"
		s.material = if e > W.WaterE - 0.05 then Enum.Material.Sand else Enum.Material.Mud
		s.depth = math.clamp((W.WaterE - e) / 0.1, 0, 1)
	elseif m > W.MarshM and e < W.WaterE + 0.1 then
		s.biome = "Marsh"
		s.material = Enum.Material.Mud
		s.depth = math.clamp((m - W.MarshM) / 0.1, 0, 1)
	elseif e < W.WaterE + 0.045 then
		s.biome = "Beach"
		s.material = Enum.Material.Sand
		s.depth = 1
	elseif e > W.RockE then
		s.biome = "Rocky"
		s.material = Enum.Material.Rock
		s.depth = math.clamp((e - W.RockE) / 0.1, 0, 1)
		s.cluster = fbm(x, z, 22, 5) > 0.58
		if s.depth < 0.3 and fbm(x, z, 15, 6) > 0.5 then
			s.material = Enum.Material.Ground -- bord des collines : terre et cailloux
		end
	elseif m > W.ForestM then
		s.depth = math.clamp((m - W.ForestM) / 0.12, 0, 1)
		if s.depth > 0.25 and fbm(x, z, W.ClearingScale, 3) < W.ClearingThreshold then
			s.biome = "Clearing"
			s.material = Enum.Material.Grass
		else
			s.biome = "Forest"
			s.material = Enum.Material.LeafyGrass
		end
	else
		s.biome = "Plains"
		s.material = Enum.Material.Grass
		-- depth négatif = proche de la forêt (lisière) ; sert aux buissons de lisière.
		s.depth = math.clamp((m - W.ForestM) / 0.06 + 1, 0, 1)
	end
	-- Chemins : une ligne sinueuse (bruit "en crête") à travers forêts et plaines.
	if (s.biome == "Forest" or s.biome == "Plains" or s.biome == "Clearing") and d > W.ClearRadius then
		local ridge = math.abs(math.noise(x / W.PathScale + offsets[13], z / W.PathScale + offsets[14]))
		if ridge < W.PathWidth then
			s.path = true
			s.material = Enum.Material.Ground
		end
	end
	-- Pentes raides : roche nue.
	if s.biome ~= "Water" then
		local slope = math.max(math.abs(World.heightAt(x + 4, z) - h), math.abs(World.heightAt(x, z + 4) - h)) / 4
		if slope > 1.1 then
			s.material = Enum.Material.Rock
		end
	end
	return s
end

function World.getSeed(): number
	return seed
end

function World.isGenerated(): boolean
	return generated
end

-- Limite de la carte (mer comprise).
function World.extent(): number
	return W.MapRadius + W.OceanMargin
end

local function removeBaseplate()
	local baseplate = workspace:FindFirstChild("Baseplate")
	if baseplate then
		baseplate:Destroy()
		print("[Survie] Baseplate supprimée (la carte est en Terrain)")
	end
end

local function buildBorders(folder: Folder)
	local e = World.extent()
	for i = 0, 3 do
		local wall = Instance.new("Part")
		wall.Name = "MapBorder"
		wall.Size = Vector3.new(e * 2 + 8, 300, 4)
		wall.CFrame = CFrame.Angles(0, i * math.pi / 2, 0) * CFrame.new(0, 100, e + 2)
		wall.Anchored = true
		wall.Transparency = 1
		wall.CanQuery = false
		wall.Parent = folder
	end
end

local function placeSpawn(folder: Folder)
	local spawn = workspace:FindFirstChildWhichIsA("SpawnLocation", true)
	if not spawn then
		local created = Instance.new("SpawnLocation")
		created.Name = "SpawnLocation"
		created.Size = Vector3.new(6, 1, 6)
		created.Anchored = true
		created.Neutral = true
		created.Duration = 0 -- pas de bouclier
		created.Color = Color3.fromRGB(120, 110, 90)
		created.Material = Enum.Material.Cobblestone
		created.Parent = folder
		spawn = created
	end
	if spawn then
		spawn.Anchored = true
		spawn.CFrame = CFrame.new(0, World.heightAt(0, 0) + 0.6, 0)
	end
end

-- Écrit un morceau de CHUNK x CHUNK studs de Terrain.
local function writeChunk(x0: number, z0: number)
	local terrain = workspace.Terrain
	local bottom = W.TerrainBottom
	local nx, nz = CHUNK // VOXEL, CHUNK // VOXEL
	local ny = (TOP - bottom) // VOXEL
	local materials: { { { Enum.Material } } } = {}
	local occupancy: { { { number } } } = {}
	for ix = 1, nx do
		local matX: { { Enum.Material } } = {}
		local occX: { { number } } = {}
		materials[ix] = matX
		occupancy[ix] = occX
		for iy = 1, ny do
			matX[iy] = table.create(nz, Enum.Material.Air)
			occX[iy] = table.create(nz, 0)
		end
		for iz = 1, nz do
			local x = x0 + (ix - 0.5) * VOXEL
			local z = z0 + (iz - 0.5) * VOXEL
			local s = World.sample(x, z)
			local h = s.height
			local under = if s.material == Enum.Material.Rock then Enum.Material.Rock else Enum.Material.Ground
			for iy = 1, ny do
				local yb = bottom + (iy - 1) * VOXEL -- bas de la cellule
				local occ = math.clamp((h - yb) / VOXEL, 0, 1)
				if occ > 0.05 then
					matX[iy][iz] = if h - yb < VOXEL * 2 then s.material else under
					occX[iy][iz] = occ
				elseif yb + VOXEL / 2 < W.WaterLevel then
					matX[iy][iz] = Enum.Material.Water
					occX[iy][iz] = 1
				end
			end
		end
	end
	local region = Region3.new(Vector3.new(x0, bottom, z0), Vector3.new(x0 + CHUNK, bottom + ny * VOXEL, z0 + CHUNK))
	terrain:WriteVoxels(region, VOXEL, materials, occupancy)
end

function World.generate()
	seed = if W.Seed ~= 0 then W.Seed else Random.new():NextInteger(1, 999999)
	local rng = Random.new(seed)
	for i = 1, 16 do -- 2 décalages par couche de bruit (couches 1 à 6) + chemins
		offsets[i] = rng:NextNumber(-5000, 5000)
	end
	print(`[Survie] Génération de la carte... graine (Seed) = {seed}`)
	local started = os.clock()

	removeBaseplate()
	local terrain = workspace.Terrain
	terrain:Clear()
	terrain.WaterWaveSize = 0.08
	terrain.WaterTransparency = 0.6

	local folder = workspace:FindFirstChild("Map")
	if not folder then
		local newFolder = Instance.new("Folder")
		newFolder.Name = "Map"
		newFolder.Parent = workspace
		folder = newFolder
	end
	assert(folder and folder:IsA("Folder"), "Map folder")

	-- Morceaux alignés sur la grille de 64 studs (la grille des voxels est alignée sur 4).
	local e = World.extent()
	local first = -math.ceil(e / CHUNK) * CHUNK
	local count = 0
	for x0 = first, -first - CHUNK, CHUNK do
		for z0 = first, -first - CHUNK, CHUNK do
			writeChunk(x0, z0)
			count += 1
			task.wait() -- une pause par morceau : le serveur reste fluide
		end
	end

	buildBorders(folder)
	placeSpawn(folder)
	generated = true
	print(`[Survie] Carte prête : {count} morceaux de terrain en {string.format("%.1f", os.clock() - started)} s`)
end

return World
