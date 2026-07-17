autowatch = 1;
inlets = 1;
outlets = 2;

var BLOCKS = ["snd_show", "snd_title", "snd_author", "snd_info_1", "snd_info_2", "snd_info_3", "snd_info_4", "snd_info_5"];
var selectedBlock = "snd_show";
var texts = {
    snd_show: "COLLAB-HUB LAB",
    snd_title: "Titre de demonstration",
    snd_author: "Artiste / auteur",
    snd_info_1: "Sous-titre",
    snd_info_2: "Description composee",
    snd_info_3: "Informations complementaires",
    snd_info_4: "Bloc texte ou image",
    snd_info_5: "Dernier bloc"
};
var visibility = [1, 1, 1, 1, 1, 1, 1, 1];
var configs = {};
var pendingTasks = [];
var presets = [];
var currentPresetName = "Nouveau preset";
var hostPatcher = this.patcher || null;
var HEADER_GAP_MS = 70;
var SECOND_PASS_MS = 900;

function defaultConfig() {
    return {
        image_url: "",
        text_position: "left",
        font_size: "default",
        image_visible: "1",
        image_position: "above",
        image_width: "auto",
        image_height: "auto",
        image_fit: "contain",
        image_align: "center",
        image_crop: "center",
        background_color: "default",
        foreground_color: "default"
    };
}

function init() {
    var i;
    for (i = 0; i < BLOCKS.length; i++) configs[BLOCKS[i]] = defaultConfig();
    configs.snd_show.image_url = "/images/ezdac.png";
    configs.snd_show.image_position = "left";
    configs.snd_show.image_width = "96px";
    configs.snd_show.image_height = "96px";
    configs.snd_show.background_color = "#112233";
    configs.snd_show.foreground_color = "white";
}
init();

function sendHeader(mode, header, values) {
    outlet(0, [mode, "all", header].concat(values));
    outlet(1, ["sent", mode, header].concat(values));
}

function scheduleHeader(delayMs, mode, header, values) {
    var task = new Task(function () { sendHeader(mode, header, values); }, this);
    pendingTasks.push(task);
    task.schedule(delayMs);
}

function cancelPendingTasks() {
    var i;
    for (i = 0; i < pendingTasks.length; i++) pendingTasks[i].cancel();
    pendingTasks = [];
}

function sendPair(header, values) {
    sendHeader("publish", header, values);
    scheduleHeader(300, "push", header, values);
}

function schedulePair(delayMs, header, values) {
    scheduleHeader(delayMs, "publish", header, values);
    scheduleHeader(delayMs + 300, "push", header, values);
}

function block(value) {
    var id = String(value || "");
    if (BLOCKS.indexOf(id) < 0) return;
    selectedBlock = id;
    outlet(1, ["state", "block", selectedBlock]);
    emitFields();
}

function emitField(name, clearName, value) {
    if (String(value || "").length) outlet(1, [name, value]);
    else outlet(1, [clearName]);
}

function emitFields() {
    emitField("fieldtext", "cleartext", texts[selectedBlock]);
    emitField("fieldurl", "clearurl", configs[selectedBlock].image_url);
    var currentSize = parseInt(configs[selectedBlock].font_size, 10);
    outlet(1, ["fontvalue", isNaN(currentSize) ? 0 : currentSize]);
    outlet(1, ["imagewidthvalue", pixelValue(configs[selectedBlock].image_width)]);
    outlet(1, ["imageheightvalue", pixelValue(configs[selectedBlock].image_height)]);
}

function pixelValue(value) {
    return /^\d+px$/.test(String(value || "")) ? parseInt(value, 10) : 0;
}

function cleanEntry(values) {
    if (values.length === 1 && String(values[0]).toLowerCase() === "bang") return "";
    return values.join(" ");
}

function presetname() {
    var value = cleanEntry(arrayfromargs(arguments)).replace(/^\s+|\s+$/g, "");
    if (value.length) currentPresetName = value;
}

function cloneConfig(source) {
    var copy = {};
    var defaults = defaultConfig();
    var key;
    for (key in defaults) copy[key] = source[key] === undefined ? defaults[key] : String(source[key]);
    return copy;
}

function capturePreset(name) {
    var blocks = [];
    var i;
    for (i = 0; i < BLOCKS.length; i++) {
        var id = BLOCKS[i];
        blocks.push({ id: id, text: texts[id], visible: visibility[i] ? 1 : 0, config: cloneConfig(configs[id]) });
    }
    return { name: name, blocks: blocks };
}

function findPreset(name) {
    var i;
    for (i = 0; i < presets.length; i++) if (presets[i].name === name) return i;
    return -1;
}

function isArray(value) {
    return Object.prototype.toString.call(value) === "[object Array]";
}

function refreshPresetMenu() {
    outlet(1, ["presetmenuclear"]);
    var i;
    for (i = 0; i < presets.length; i++) outlet(1, ["presetmenuappend", presets[i].name]);
}

function presetStatus() {
    outlet(1, ["presetstatus"].concat(arrayfromargs(arguments)));
}

function savepreset() {
    var name = currentPresetName.replace(/^\s+|\s+$/g, "");
    if (!name.length) { presetStatus("Nom de preset requis"); return; }
    var index = findPreset(name);
    var preset = capturePreset(name);
    if (index >= 0) presets[index] = preset;
    else presets.push(preset);
    refreshPresetMenu();
    var automaticPath = persistPresets();
    presetStatus("Preset sauvegardé :", name, "·", presets.length, "preset(s)", automaticPath ? "· JSON auto" : "");
}

function applyPreset(preset) {
    if (!preset || !isArray(preset.blocks)) return false;
    var nextVisibility = visibility.slice(0);
    var i;
    var j;
    for (i = 0; i < preset.blocks.length; i++) {
        var blockData = preset.blocks[i];
        var index = BLOCKS.indexOf(String(blockData.id || ""));
        if (index < 0) continue;
        var id = BLOCKS[index];
        texts[id] = String(blockData.text === undefined ? "" : blockData.text);
        configs[id] = cloneConfig(blockData.config || {});
        nextVisibility[index] = Number(blockData.visible) ? 1 : 0;
        outlet(1, ["state", "text", id, texts[id]]);
        var defaults = defaultConfig();
        for (j in defaults) outlet(1, ["state", "config", id, j, configs[id][j]]);
    }
    visibility = nextVisibility;
    outlet(1, ["state", "visibility"].concat(visibility));
    emitFields();
    return true;
}

function recallpreset() {
    var name = cleanEntry(arrayfromargs(arguments)).replace(/^\s+|\s+$/g, "");
    var index = findPreset(name);
    if (index < 0) { presetStatus("Preset introuvable :", name); return; }
    currentPresetName = presets[index].name;
    if (!applyPreset(presets[index])) { presetStatus("Preset invalide :", name); return; }
    presetStatus("Preset rappelé :", name, "· envoi web en cours");
    sendall();
}

function presetPayload() {
    return {
        schema: "collab-hub-block-presets",
        version: 1,
        exportedAt: new Date().toISOString(),
        presets: presets
    };
}

function jsonPath(value) {
    var path = String(value || "");
    return /\.json$/i.test(path) ? path : path + ".json";
}

function defaultPresetPath() {
    var source = hostPatcher && hostPatcher.filepath ? String(hostPatcher.filepath) : "";
    if (!source.length) return "";
    return source.replace(/[^\\\/]+$/, "") + "CollabHub_54_55_Presets.json";
}

function writePresetFile(path) {
    if (typeof Dict === "undefined" || !path) return false;
    var dictionary = new Dict();
    dictionary.quiet = true;
    dictionary.parse(JSON.stringify(presetPayload()));
    dictionary.export_json(path);
    return true;
}

function persistPresets() {
    var path = defaultPresetPath();
    if (!path.length) return "";
    try { return writePresetFile(path) ? path : ""; }
    catch (error) { return ""; }
}

function acceptPresetPayload(payload) {
    if (!payload || payload.schema !== "collab-hub-block-presets" || Number(payload.version) !== 1 || !isArray(payload.presets)) return false;
    presets = payload.presets;
    refreshPresetMenu();
    return true;
}

function exportjson(value) {
    if (typeof Dict === "undefined") { presetStatus("Export JSON indisponible hors de Max"); return; }
    var path = jsonPath(value);
    try {
        writePresetFile(path);
        presetStatus("JSON exporté :", path);
    } catch (error) {
        presetStatus("Erreur export JSON :", String(error));
    }
}

function importjson(value) {
    if (typeof Dict === "undefined") { presetStatus("Import JSON indisponible hors de Max"); return; }
    var path = String(value || "");
    try {
        var dictionary = new Dict();
        dictionary.import_json(path);
        var payload = JSON.parse(dictionary.stringify());
        if (!acceptPresetPayload(payload)) {
            presetStatus("JSON incompatible");
            return;
        }
        presetStatus("JSON importé :", presets.length, "preset(s)");
    } catch (error) {
        presetStatus("Erreur import JSON :", String(error));
    }
}

function loadbang() {
    var path = defaultPresetPath();
    if (typeof Dict === "undefined" || !path.length) return;
    try {
        var dictionary = new Dict();
        dictionary.quiet = true;
        dictionary.import_json(path);
        if (acceptPresetPayload(JSON.parse(dictionary.stringify()))) {
            presetStatus("Presets auto chargés :", presets.length);
        }
    } catch (error) {
        // Premier lancement : le fichier sera créé au premier SAVE.
    }
}

function text() {
    var value = cleanEntry(arrayfromargs(arguments));
    texts[selectedBlock] = value;
    outlet(1, ["state", "text", selectedBlock, value]);
    sendPair(selectedBlock, value.length ? [value] : [""]);
}

function imageurl() {
    var value = cleanEntry(arrayfromargs(arguments));
    setConfig("image_url", value);
}

function setConfig(property, value) {
    var normalized = String(value === undefined ? "" : value);
    configs[selectedBlock][property] = normalized;
    outlet(1, ["state", "config", selectedBlock, property, normalized]);
    if (property === "font_size") {
        var currentSize = parseInt(normalized, 10);
        outlet(1, ["fontvalue", isNaN(currentSize) ? 0 : currentSize]);
    }
    if (property === "image_width") outlet(1, ["imagewidthvalue", pixelValue(normalized)]);
    if (property === "image_height") outlet(1, ["imageheightvalue", pixelValue(normalized)]);
    var payload = [selectedBlock, property];
    if (normalized.length) payload.push(normalized);
    sendPair("block_config", payload);
}

function position(value) { setConfig("image_position", value); }
function textposition(value) { setConfig("text_position", value); }
function fontsize(value) {
    var amount = Math.round(Number(value));
    if (amount === 0) { resetfont(); return; }
    if (amount < 8 || amount > 96) return;
    setConfig("font_size", amount + "px");
}
function fontpreset(value) {
    var presets = { s: 14, m: 18, l: 26, xl: 40 };
    var key = String(value || "m").toLowerCase();
    if (key === "reset") { resetfont(); return; }
    if (presets[key]) fontsize(presets[key]);
}
function resetfont() { setConfig("font_size", "default"); }

function markdownpreset(value) {
    var name = String(value || "basic").toLowerCase();
    var examples = {
        basic: "**GRAS** *italique* ***gras + italique*** `code`",
        color: "[ROUGE]{color:red} [VERT]{color:green} [BLEU]{color:blue} [ACCENT]{color:accent} [HEX]{color:FF6B35}",
        link: "[OpenAI]{https://openai.com} | lien sécurisé",
        layout: "Ligne 1|Ligne 2||Nouveau paragraphe|||Séparateur",
        long: "**TEXTE LONG** pour vérifier le retour à la ligne avec une taille précise et sans débordement horizontal dans la carte."
    };
    var content = examples[name] || examples.basic;
    texts[selectedBlock] = content;
    outlet(1, ["state", "text", selectedBlock, content]);
    emitFields();
    sendPair(selectedBlock, [content]);
}
function fit(value) { setConfig("image_fit", value); }
function align(value) { setConfig("image_align", value); }
function crop(value) { setConfig("image_crop", value); }
function imagevisible(value) { setConfig("image_visible", Number(value) ? "1" : "0"); }

function imageDimension(property, value) {
    var amount = Math.round(Number(value));
    if (amount === 0) { setConfig(property, "auto"); return; }
    if (amount < 1 || amount > 2000) return;
    setConfig(property, amount + "px");
}

function imagewidth(value) { imageDimension("image_width", value); }
function imageheight(value) { imageDimension("image_height", value); }

function size(value) {
    var preset = String(value || "auto");
    var dimensions = {
        auto: ["auto", "auto"],
        logo: ["96px", "96px"],
        card: ["280px", "180px"],
        wide: ["100%", "240px"],
        hero: ["100%", "420px"]
    };
    var pair = dimensions[preset] || dimensions.auto;
    setConfig("image_width", pair[0]);
    schedulePair(260, "block_config", [selectedBlock, "image_height", pair[1]]);
    configs[selectedBlock].image_height = pair[1];
    outlet(1, ["state", "config", selectedBlock, "image_height", pair[1]]);
    outlet(1, ["imageheightvalue", pixelValue(pair[1])]);
}

function palette(value) {
    var name = String(value || "default");
    var palettes = {
        "default": ["default", "default"],
        ocean: ["#112233", "white"],
        amber: ["#3b2505", "#ffcc66"],
        cyan: ["#083344", "#67e8f9"],
        paper: ["white", "black"]
    };
    var colors = palettes[name] || palettes["default"];
    setConfig("background_color", colors[0]);
    schedulePair(260, "block_config", [selectedBlock, "foreground_color", colors[1]]);
    configs[selectedBlock].foreground_color = colors[1];
    outlet(1, ["state", "config", selectedBlock, "foreground_color", colors[1]]);
}

function colorByte(value) {
    var amount = Number(value);
    if (!isFinite(amount)) return 0;
    if (amount >= 0 && amount <= 1) amount *= 255;
    return Math.max(0, Math.min(255, Math.round(amount)));
}

function colorHex(values) {
    if (values.length < 3) return null;
    var components = [colorByte(values[0]), colorByte(values[1]), colorByte(values[2])];
    return "#" + components.map(function (component) {
        return (component < 16 ? "0" : "") + component.toString(16);
    }).join("");
}

function custombackground() {
    var values = arrayfromargs(arguments);
    var hex = colorHex(values);
    if (!hex) return;
    var red = colorByte(values[0]);
    var green = colorByte(values[1]);
    var blue = colorByte(values[2]);
    var foreground = red * 0.299 + green * 0.587 + blue * 0.114 > 148 ? "black" : "white";
    setConfig("background_color", hex);
    schedulePair(260, "block_config", [selectedBlock, "foreground_color", foreground]);
    configs[selectedBlock].foreground_color = foreground;
    outlet(1, ["state", "config", selectedBlock, "foreground_color", foreground]);
}

function customforeground() {
    var hex = colorHex(arrayfromargs(arguments));
    if (hex) setConfig("foreground_color", hex);
}

function imagepreset(value) {
    var name = String(value || "clear");
    var urls = {
        logo: "/images/ezdac.png",
        spectrum: "/images/spectre_chroma.png",
        test: "/images/collab-hub-image-test.svg",
        remote: "https://picsum.photos/640/420",
        clear: ""
    };
    setConfig("image_url", urls[name] || "");
    if (name === "clear") schedulePair(260, "block_config", [selectedBlock, "image_visible", "0"]);
    else schedulePair(260, "block_config", [selectedBlock, "image_visible", "1"]);
    configs[selectedBlock].image_visible = name === "clear" ? "0" : "1";
    outlet(1, ["state", "config", selectedBlock, "image_visible", configs[selectedBlock].image_visible]);
}

function solo() {
    var i;
    for (i = 0; i < visibility.length; i++) visibility[i] = BLOCKS[i] === selectedBlock ? 1 : 0;
    outlet(1, ["state", "visibility"].concat(visibility));
    sendPair("visibility", visibility);
}

function showall() {
    visibility = [1, 1, 1, 1, 1, 1, 1, 1];
    outlet(1, ["state", "visibility"].concat(visibility));
    sendPair("visibility", visibility);
}

function togglevisible() {
    var index = BLOCKS.indexOf(selectedBlock);
    visibility[index] = visibility[index] ? 0 : 1;
    outlet(1, ["state", "visibility"].concat(visibility));
    sendPair("visibility", visibility);
}

function commandsForState() {
    var commands = [];
    var properties = ["text_position", "font_size", "image_url", "image_visible", "image_position", "image_width", "image_height", "image_fit", "image_align", "image_crop", "background_color", "foreground_color"];
    var i;
    var j;
    for (i = 0; i < BLOCKS.length; i++) commands.push([BLOCKS[i], [texts[BLOCKS[i]]]]);
    commands.push(["visibility", visibility.slice(0)]);
    for (i = 0; i < BLOCKS.length; i++) {
        for (j = 0; j < properties.length; j++) {
            var property = properties[j];
            var value = configs[BLOCKS[i]][property];
            if (value !== defaultConfig()[property] || property === "image_visible") {
                commands.push(["block_config", [BLOCKS[i], property, value]]);
            }
        }
    }
    return commands;
}

function schedulePass(baseDelay, mode, commands) {
    var i;
    for (i = 0; i < commands.length; i++) {
        scheduleHeader(baseDelay + i * HEADER_GAP_MS, mode, commands[i][0], commands[i][1]);
    }
}

function sendall() {
    cancelPendingTasks();
    var commands = commandsForState();
    schedulePass(0, "publish", commands);
    schedulePass(SECOND_PASS_MS + commands.length * HEADER_GAP_MS, "push", commands);
    outlet(1, ["progress", commands.length, "commandes", "publish puis push"]);
}

function bang() { sendall(); }

function anything() {
    var values = arrayfromargs(arguments);
    if (messagename === "block" && values.length) block(values[0]);
    else if (messagename === "text") text.apply(this, values);
    else if (messagename === "imageurl") imageurl.apply(this, values);
    else if (messagename === "position" && values.length) position(values[0]);
    else if (messagename === "textposition" && values.length) textposition(values[0]);
    else if (messagename === "fontsize" && values.length) fontsize(values[0]);
    else if (messagename === "fontpreset" && values.length) fontpreset(values[0]);
    else if (messagename === "resetfont") resetfont();
    else if (messagename === "markdownpreset" && values.length) markdownpreset(values[0]);
    else if (messagename === "fit" && values.length) fit(values[0]);
    else if (messagename === "align" && values.length) align(values[0]);
    else if (messagename === "crop" && values.length) crop(values[0]);
    else if (messagename === "size" && values.length) size(values[0]);
    else if (messagename === "imagewidth" && values.length) imagewidth(values[0]);
    else if (messagename === "imageheight" && values.length) imageheight(values[0]);
    else if (messagename === "palette" && values.length) palette(values[0]);
    else if (messagename === "custombackground" && values.length >= 3) custombackground.apply(this, values);
    else if (messagename === "customforeground" && values.length >= 3) customforeground.apply(this, values);
    else if (messagename === "imagepreset" && values.length) imagepreset(values[0]);
    else if (messagename === "solo") solo();
    else if (messagename === "showall") showall();
    else if (messagename === "togglevisible") togglevisible();
    else if (messagename === "sendall") sendall();
    else if (messagename === "presetname") presetname.apply(this, values);
    else if (messagename === "savepreset") savepreset();
    else if (messagename === "recallpreset") recallpreset.apply(this, values);
    else if (messagename === "exportjson" && values.length) exportjson(values.join(" "));
    else if (messagename === "importjson" && values.length) importjson(values.join(" "));
}
