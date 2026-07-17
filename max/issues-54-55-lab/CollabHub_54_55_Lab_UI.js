autowatch = 1;
inlets = 1;
outlets = 1;

mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

var blocks = ["snd_show", "snd_title", "snd_author", "snd_info_1", "snd_info_2", "snd_info_3", "snd_info_4", "snd_info_5"];
var labels = ["SHOW", "TITLE", "AUTHOR", "INFO 1", "INFO 2", "INFO 3", "INFO 4", "INFO 5"];
var selected = 0;
var positions = ["above", "below", "left", "right", "background"];
var textPositions = ["left", "center", "right"];
var fontPresets = ["s", "m", "l", "xl", "reset"];
var markdownPresets = ["basic", "color", "link", "layout", "long"];
var sizes = ["auto", "logo", "card", "wide", "hero"];
var fits = ["contain", "cover", "fill", "none"];
var palettes = ["default", "ocean", "amber", "cyan", "paper"];
var imagePresets = ["logo", "spectrum", "test", "remote", "clear"];
var visibility = [1, 1, 1, 1, 1, 1, 1, 1];
var texts = ["COLLAB-HUB LAB", "Titre de demonstration", "Artiste / auteur", "Sous-titre", "Description composee", "Informations complementaires", "Bloc texte ou image", "Dernier bloc"];
var configs = [];
var connectionState = "connexion inconnue";
var activity = "Sélectionne un bloc, puis construis son contenu";

var colors = {
    bg: [0.035, 0.047, 0.063, 1],
    surface: [0.067, 0.086, 0.115, 1],
    surface2: [0.09, 0.118, 0.153, 1],
    line: [0.18, 0.24, 0.31, 1],
    text: [0.92, 0.94, 0.96, 1],
    muted: [0.58, 0.65, 0.73, 1],
    cyan: [0.30, 0.82, 0.96, 1],
    cyanDark: [0.08, 0.30, 0.40, 1],
    orange: [1.0, 0.62, 0.08, 1],
    green: [0.24, 0.84, 0.64, 1],
    red: [0.95, 0.32, 0.32, 1]
};

function makeConfig() {
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
    for (i = 0; i < blocks.length; i++) configs.push(makeConfig());
    configs[0].image_url = "/images/ezdac.png";
    configs[0].image_position = "left";
    configs[0].image_width = "96px";
    configs[0].image_height = "96px";
    configs[0].background_color = "#112233";
    configs[0].foreground_color = "white";
}
init();

function width() { return box.rect[2] - box.rect[0]; }
function height() { return box.rect[3] - box.rect[1]; }

function fillRect(x, y, w, h, color) {
    mgraphics.set_source_rgba(color);
    mgraphics.rectangle(x, y, w, h);
    mgraphics.fill();
}

function strokeRect(x, y, w, h, color, lineWidth) {
    mgraphics.set_source_rgba(color);
    mgraphics.set_line_width(lineWidth || 1);
    mgraphics.rectangle(x, y, w, h);
    mgraphics.stroke();
}

function textAt(value, x, y, size, color, bold) {
    mgraphics.set_source_rgba(color || colors.text);
    mgraphics.select_font_face("Arial", 0, bold ? 1 : 0);
    mgraphics.set_font_size(size || 12);
    mgraphics.move_to(x, y);
    mgraphics.show_text(String(value));
}

function centeredText(value, x, y, w, size, color, bold) {
    var label = String(value);
    var estimate = label.length * (size || 12) * 0.54;
    textAt(label, x + Math.max(5, (w - estimate) / 2), y, size, color, bold);
}

function truncate(value, max) {
    var source = String(value || "");
    return source.length > max ? source.substring(0, max - 1) + "…" : source;
}

function button(x, y, w, h, label, active, accent, disabled) {
    var background = disabled ? [0.055, 0.065, 0.078, 1] : (active ? (accent || colors.cyanDark) : colors.surface2);
    var border = disabled ? [0.11, 0.13, 0.16, 1] : (active ? colors.cyan : colors.line);
    var textColor = disabled ? [0.30, 0.33, 0.37, 1] : (active ? colors.text : colors.muted);
    fillRect(x, y, w, h, background);
    strokeRect(x, y, w, h, border, active && !disabled ? 2 : 1);
    centeredText(label.toUpperCase(), x, y + h / 2 + 4, w, 9, textColor, true);
}

function hasActiveImage() {
    return Boolean(configs[selected].image_url) && configs[selected].image_visible !== "0";
}

function drawHeader() {
    textAt("COLLAB-HUB CONTENT LAB", 24, 29, 21, colors.text, true);
    textAt("ISSUES #54 + #55 + #56  ·  8 blocs fixes  ·  texte + image + typographie", 24, 51, 11, colors.muted, false);
    textAt(connectionState, width() - 205, 29, 11, connectionState === "MAX CONNECTÉ" ? colors.green : colors.muted, true);
    textAt("ordre verrouillé 0 → 7", width() - 205, 49, 10, colors.cyan, false);
}

function drawBlockCards() {
    var gap = 7;
    var startX = 24;
    var y = 68;
    var cardW = (width() - 48 - gap * 7) / 8;
    var i;
    for (i = 0; i < blocks.length; i++) {
        var x = startX + i * (cardW + gap);
        var active = i === selected;
        fillRect(x, y, cardW, 72, active ? colors.cyanDark : colors.surface);
        strokeRect(x, y, cardW, 72, active ? colors.cyan : colors.line, active ? 3 : 1);
        textAt(String(i), x + 9, y + 17, 10, active ? colors.cyan : colors.muted, true);
        centeredText(labels[i], x, y + 35, cardW, 11, active ? colors.text : colors.muted, true);
        centeredText(visibility[i] ? configs[i].font_size.toUpperCase() : "MASQUÉ", x, y + 57, cardW, 9, visibility[i] ? colors.green : colors.red, false);
    }
}

function paletteColors(name) {
    var map = {
        "default": [[0.067, 0.086, 0.115, 1], colors.text],
        "#112233": [[0.067, 0.133, 0.20, 1], [1, 1, 1, 1]],
        "#3b2505": [[0.23, 0.145, 0.02, 1], [1, 0.80, 0.40, 1]],
        "#083344": [[0.03, 0.20, 0.27, 1], [0.40, 0.91, 0.98, 1]],
        white: [[0.95, 0.95, 0.91, 1], [0.06, 0.07, 0.08, 1]]
    };
    if (map[name]) return map[name];
    var match = String(name || "").match(/^#([0-9a-f]{6})$/i);
    if (!match) return map["default"];
    var value = parseInt(match[1], 16);
    var background = [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, 1];
    var light = background[0] * 0.299 + background[1] * 0.587 + background[2] * 0.114 > 0.58;
    return [background, light ? [0.06, 0.07, 0.08, 1] : [1, 1, 1, 1]];
}

function singleColor(value, fallback) {
    var name = String(value || "").toLowerCase();
    if (name === "white") return [1, 1, 1, 1];
    if (name === "black") return [0.04, 0.05, 0.06, 1];
    var match = name.match(/^#([0-9a-f]{6})$/);
    if (!match) return fallback;
    var amount = parseInt(match[1], 16);
    return [((amount >> 16) & 255) / 255, ((amount >> 8) & 255) / 255, (amount & 255) / 255, 1];
}

function drawImagePlaceholder(x, y, w, h, background) {
    fillRect(x, y, w, h, background ? [0.06, 0.10, 0.14, 1] : [0.035, 0.047, 0.063, 1]);
    strokeRect(x, y, w, h, colors.cyan, 2);
    centeredText("IMAGE", x, y + h / 2, w, 11, colors.cyan, true);
    centeredText(truncate(configs[selected].image_width + " × " + configs[selected].image_height, 20), x, y + h / 2 + 20, w, 9, colors.muted, false);
}

function drawPreview() {
    var panelX = 24;
    var panelY = 158;
    var panelW = 690;
    var panelH = 430;
    var config = configs[selected];
    var palette = paletteColors(config.background_color);
    fillRect(panelX, panelY, panelW, panelH, colors.surface);
    strokeRect(panelX, panelY, panelW, panelH, colors.line, 1);
    textAt("APERÇU LOCAL DU BLOC", panelX + 18, panelY + 27, 13, colors.text, true);
    textAt(blocks[selected] + "  ·  index " + selected, panelX + 18, panelY + 48, 11, colors.cyan, false);

    var bx = panelX + 18;
    var by = panelY + 65;
    var bw = panelW - 36;
    var bh = 190;
    fillRect(bx, by, bw, bh, palette[0]);
    strokeRect(bx, by, bw, bh, colors.line, 1);

    if (!visibility[selected]) {
        centeredText("BLOC MASQUÉ PAR VISIBILITY", bx, by + 98, bw, 14, colors.red, true);
    } else {
        var hasImage = config.image_url && config.image_visible !== "0";
        var pos = config.image_position;
        if (hasImage && pos === "background") drawImagePlaceholder(bx, by, bw, bh, true);
        if (hasImage && pos === "above") drawImagePlaceholder(bx + 22, by + 14, bw - 44, 78, false);
        if (hasImage && pos === "below") drawImagePlaceholder(bx + 22, by + 99, bw - 44, 76, false);
        if (hasImage && pos === "left") drawImagePlaceholder(bx + 20, by + 35, 140, 120, false);
        if (hasImage && pos === "right") drawImagePlaceholder(bx + bw - 160, by + 35, 140, 120, false);
        var tx = bx + 24;
        var tw = bw - 48;
        var ty = by + 103;
        if (pos === "above") ty = by + 125;
        if (pos === "below") ty = by + 55;
        if (pos === "left") { tx = bx + 184; tw = bw - 208; ty = by + 91; }
        if (pos === "right") { tw = bw - 208; ty = by + 91; }
        if (pos === "background") ty = by + 102;
        var previewSize = config.font_size === "default" ? 18 : Math.max(8, Math.min(40, parseInt(config.font_size, 10)));
        var textValue = truncate(texts[selected], 48);
        if (!hasImage) { tx = bx + 24; tw = bw - 48; ty = by + 96; }
        if (config.text_position === "center") tx += Math.max(0, (tw - textValue.length * previewSize * 0.54) / 2);
        if (config.text_position === "right") tx += Math.max(0, tw - textValue.length * previewSize * 0.54);
        textAt(textValue, tx, ty, previewSize, palette[1], true);
        textAt("texte: " + config.text_position + "  ·  typo: " + config.font_size + "  ·  image: " + pos, bx + 24, by + 158, 10, palette[1], false);
    }

    textAt("Texte : " + truncate(texts[selected], 70), panelX + 18, panelY + 332, 11, colors.text, false);
    textAt("Image : " + truncate(config.image_url || "(aucune)", 72), panelX + 18, panelY + 354, 10, colors.muted, false);
}

function drawControls() {
    var x = 732;
    var y = 158;
    var w = width() - x - 24;
    fillRect(x, y, w, 430, colors.surface);
    strokeRect(x, y, w, 430, colors.line, 1);
    textAt("CONSTRUIRE LES DONNÉES", x + 16, y + 27, 13, colors.text, true);
    textAt("Chaque clic = aperçu local + publish puis push", x + 16, y + 47, 10, colors.muted, false);

    fillRect(x + 10, y + 58, w - 20, 158, [0.052, 0.068, 0.09, 1]);
    strokeRect(x + 10, y + 58, w - 20, 158, colors.line, 1);
    textAt("PARAMÈTRES IMAGE", x + 18, y + 73, 9, hasActiveImage() ? colors.cyan : colors.muted, true);
    drawLabeledRow(x, y + 78, w, "SOURCE", imagePresets, "image");
    drawLabeledRow(x, y + 114, w, "POSITION", positions, "position");
    drawLabeledRow(x, y + 150, w, "TAILLE", sizes, "size");
    drawLabeledRow(x, y + 186, w, "FIT", fits, "fit");

    fillRect(x + 10, y + 222, w - 20, 164, [0.052, 0.068, 0.09, 1]);
    strokeRect(x + 10, y + 222, w - 20, 164, colors.line, 1);
    textAt("TEXTE & TYPOGRAPHIE", x + 18, y + 237, 9, colors.cyan, true);
    drawPaletteRow(x, y + 242, w);
    drawLabeledRow(x, y + 278, w, "POSITION", textPositions, "textposition");
    drawTypographyRow(x, y + 314, w);
    drawLabeledRow(x, y + 350, w, "MARKDOWN", markdownPresets, "markdownpreset");

    var aw = (w - 40) / 3;
    button(x + 16, y + 394, aw, 25, "SOLO", false, colors.cyanDark);
    button(x + 20 + aw, y + 394, aw, 25, "SHOW ALL", false, colors.cyanDark);
    button(x + 24 + aw * 2, y + 394, aw, 25, visibility[selected] === 0 ? "SHOW" : "HIDE", visibility[selected] === 0, colors.cyanDark);
}

function drawLabeledRow(x, y, w, label, items, kind) {
    textAt(label, x + 16, y + 19, 9, colors.cyan, true);
    drawButtonRow(x + 92, y, w - 108, items, kind);
}

function drawPaletteRow(x, y, w) {
    textAt("PALETTE", x + 16, y + 19, 9, colors.cyan, true);
    fillRect(x + 92, y, w - 108, 31, [0.055, 0.065, 0.078, 1]);
    strokeRect(x + 92, y, w - 108, 31, colors.line, 1);
    centeredText("CONTRÔLES MAX NATIFS CI-DESSOUS ↓", x + 92, y + 19, w - 108, 8, colors.muted, true);
}

function drawTypographyRow(x, y, w) {
    textAt("TAILLE", x + 16, y + 19, 9, colors.cyan, true);
    fillRect(x + 92, y, w - 108, 31, [0.055, 0.065, 0.078, 1]);
    strokeRect(x + 92, y, w - 108, 31, colors.line, 1);
    centeredText("SAISIE PX NATIVE CI-DESSOUS ↓", x + 92, y + 19, w - 108, 8, colors.muted, true);
}

function drawButtonRow(x, y, w, items, kind) {
    var gap = 4;
    var itemW = (w - gap * (items.length - 1)) / items.length;
    var i;
    var config = configs[selected];
    var disabled = (kind === "position" || kind === "size" || kind === "fit") && !hasActiveImage();
    for (i = 0; i < items.length; i++) {
        var active = false;
        if (kind === "position") active = config.image_position === items[i];
        if (kind === "textposition") active = config.text_position === items[i];
        if (kind === "fontpreset") {
            var values = { s: "14px", m: "18px", l: "26px", xl: "40px", reset: "default" };
            active = config.font_size === values[items[i]];
        }
        if (kind === "fit") active = config.image_fit === items[i];
        if (kind === "palette") {
            var paletteValues = { "default": "default", ocean: "#112233", amber: "#3b2505", cyan: "#083344", paper: "white" };
            active = config.background_color === paletteValues[items[i]];
        }
        if (kind === "size") active = (items[i] === "logo" && config.image_width === "96px") || (items[i] === "auto" && config.image_width === "auto") || (items[i] === "wide" && config.image_height === "240px") || (items[i] === "hero" && config.image_height === "420px") || (items[i] === "card" && config.image_width === "280px");
        button(x + i * (itemW + gap), y, itemW, 31, items[i], active, colors.cyanDark, disabled);
    }
}

function drawOverview() {
    var x = 24;
    var y = 605;
    var w = width() - 48;
    var rowX = x + 16;
    var rowW = w - 32;
    var rowY = y + 39;
    var rowH = 23;
    var i;
    fillRect(x, y, w, 230, colors.surface);
    strokeRect(x, y, w, 230, colors.line, 1);
    textAt("PRÉVISUALISATION COMPLÈTE DES 8 BLOCS", x + 16, y + 25, 13, colors.text, true);
    textAt("ordre fixe · visibilité · texte · image · position · taille", x + 360, y + 25, 10, colors.muted, false);

    for (i = 0; i < blocks.length; i++) {
        var active = i === selected;
        var rowColor = active ? colors.cyanDark : (i % 2 ? [0.075, 0.098, 0.128, 1] : [0.055, 0.073, 0.098, 1]);
        fillRect(rowX, rowY + i * rowH, rowW, rowH - 2, rowColor);
        if (active) strokeRect(rowX, rowY + i * rowH, rowW, rowH - 2, colors.cyan, 2);
        textAt(String(i), rowX + 9, rowY + 16 + i * rowH, 9, colors.cyan, true);
        textAt(blocks[i], rowX + 32, rowY + 16 + i * rowH, 10, colors.text, true);
        textAt(truncate(texts[i], 45), rowX + 160, rowY + 16 + i * rowH, 10, visibility[i] ? colors.text : colors.muted, false);
        var imageLabel = configs[i].image_url && configs[i].image_visible !== "0"
            ? "IMAGE " + configs[i].image_position.toUpperCase()
            : "SANS IMAGE";
        textAt(imageLabel, rowX + rowW - 275, rowY + 16 + i * rowH, 9, configs[i].image_url ? colors.cyan : colors.muted, true);
        var stateLabel = visibility[i] ? configs[i].text_position.toUpperCase() + " " + configs[i].font_size.toUpperCase() : "MASQUÉ";
        textAt(stateLabel, rowX + rowW - 92, rowY + 16 + i * rowH, 9, visibility[i] ? colors.green : colors.red, true);
    }
}

function paint() {
    fillRect(0, 0, width(), height(), colors.bg);
    drawHeader();
    drawBlockCards();
    drawPreview();
    drawControls();
    drawOverview();
}

function hit(x, y, rx, ry, rw, rh) { return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh; }

function rowHit(x, y, rowY, items, command, customWidth, customX) {
    var rowX = customX || 824;
    var rowW = customWidth || (width() - 864);
    var gap = 4;
    var itemW = (rowW - gap * (items.length - 1)) / items.length;
    var i;
    for (i = 0; i < items.length; i++) {
        if (hit(x, y, rowX + i * (itemW + gap), rowY, itemW, 31)) {
            if ((command === "position" || command === "size" || command === "fit") && !hasActiveImage()) {
                activity = "Ajoute d'abord une image au bloc pour activer ce réglage";
                return true;
            }
            outlet(0, [command, items[i]]);
            activity = "Envoyé : " + blocks[selected] + " · " + command + " " + items[i];
            return true;
        }
    }
    return false;
}

function onclick(x, y) {
    var gap = 7;
    var cardW = (width() - 48 - gap * 7) / 8;
    var i;
    for (i = 0; i < blocks.length; i++) {
        if (hit(x, y, 24 + i * (cardW + gap), 68, cardW, 72)) {
            selected = i;
            activity = "Bloc actif : " + blocks[i] + " (index " + i + ")";
            outlet(0, ["block", blocks[i]]);
            mgraphics.redraw();
            return;
        }
    }

    if (rowHit(x, y, 236, imagePresets, "imagepreset")) { mgraphics.redraw(); return; }
    if (rowHit(x, y, 272, positions, "position")) { mgraphics.redraw(); return; }
    if (rowHit(x, y, 308, sizes, "size")) { mgraphics.redraw(); return; }
    if (rowHit(x, y, 344, fits, "fit")) { mgraphics.redraw(); return; }
    if (rowHit(x, y, 436, textPositions, "textposition")) { mgraphics.redraw(); return; }
    if (rowHit(x, y, 508, markdownPresets, "markdownpreset")) { mgraphics.redraw(); return; }

    var actionX = 748;
    var actionW = width() - 780;
    var aw = (actionW - 8) / 3;
    if (hit(x, y, actionX, 552, aw, 25)) outlet(0, "solo");
    else if (hit(x, y, actionX + aw + 4, 552, aw, 25)) outlet(0, "showall");
    else if (hit(x, y, actionX + aw * 2 + 8, 552, aw, 25)) outlet(0, "togglevisible");
    mgraphics.redraw();
}

function state() {
    var args = arrayfromargs(arguments);
    var type = String(args.shift() || "");
    var id;
    var index;
    if (type === "block") {
        id = String(args[0] || "");
        index = blocks.indexOf(id);
        if (index >= 0) selected = index;
    } else if (type === "text") {
        id = String(args.shift() || "");
        index = blocks.indexOf(id);
        if (index >= 0) texts[index] = args.join(" ");
    } else if (type === "config") {
        id = String(args.shift() || "");
        index = blocks.indexOf(id);
        var property = String(args.shift() || "");
        if (index >= 0 && configs[index][property] !== undefined) configs[index][property] = args.join(" ");
    } else if (type === "visibility") visibility = args.map(Number);
    mgraphics.redraw();
}

function connection(value) {
    connectionState = Number(value) ? "MAX CONNECTÉ" : "MAX DÉCONNECTÉ";
    mgraphics.redraw();
}

function sent() {
    activity = "Envoyé : " + arrayfromargs(arguments).join(" ");
    mgraphics.redraw();
}

function progress() {
    activity = "SEND ALL : " + arrayfromargs(arguments).join(" ");
    mgraphics.redraw();
}

function fields() {
    // Message technique utilisé uniquement pour synchroniser les deux textedit.
}

function onresize() { mgraphics.redraw(); }

function anything() {
    var args = arrayfromargs(arguments);
    if (messagename === "connection") connection(args[0]);
    else activity = [messagename].concat(args).join(" ");
    mgraphics.redraw();
}
