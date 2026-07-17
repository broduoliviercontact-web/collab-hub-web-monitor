{
  "patcher": {
    "fileversion": 1,
    "appversion": {
      "major": 9,
      "minor": 0,
      "revision": 9,
      "architecture": "x64",
      "modernui": 1
    },
    "classnamespace": "box",
    "rect": [70.0, 55.0, 1140.0, 1440.0],
    "openinpresentation": 1,
    "default_fontname": "Arial",
    "default_fontsize": 12.0,
    "gridonopen": 1,
    "gridsize": [15.0, 15.0],
    "toolbarvisible": 1,
    "boxes": [
      {
        "box": {
          "id": "obj-bg",
          "maxclass": "panel",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [15.0, 15.0, 1100.0, 1450.0],
          "presentation": 1,
          "presentation_rect": [0.0, 0.0, 1140.0, 1490.0],
          "background": 1,
          "bgcolor": [0.035, 0.047, 0.063, 1.0]
        }
      },
      {
        "box": {
          "id": "obj-ui",
          "maxclass": "jsui",
          "filename": "CollabHub_54_55_Lab_UI.js",
          "jsarguments": [],
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "parameter_enable": 0,
          "patching_rect": [25.0, 25.0, 1090.0, 850.0],
          "presentation": 1,
          "presentation_rect": [20.0, 14.0, 1100.0, 850.0]
        }
      },
      {
        "box": {
          "id": "obj-input-panel",
          "maxclass": "panel",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [25.0, 775.0, 1090.0, 150.0],
          "presentation": 1,
          "presentation_rect": [24.0, 876.0, 1096.0, 226.0],
          "background": 1,
          "bgcolor": [0.067, 0.086, 0.115, 1.0],
          "bordercolor": [0.30, 0.82, 0.96, 1.0]
        }
      },
      {
        "box": {
          "id": "obj-input-title",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "SAISIE DU BLOC ACTIF — clique dans un champ puis presse ENTRÉE",
          "fontface": 1,
          "fontsize": 13.0,
          "textcolor": [0.30, 0.82, 0.96, 1.0],
          "patching_rect": [42.0, 844.0, 700.0, 22.0],
          "presentation": 1,
          "presentation_rect": [42.0, 888.0, 700.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-text-label",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "TEXTE",
          "fontface": 1,
          "fontsize": 12.0,
          "textcolor": [0.92, 0.94, 0.96, 1.0],
          "patching_rect": [42.0, 875.0, 95.0, 22.0],
          "presentation": 1,
          "presentation_rect": [42.0, 921.0, 95.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-url-label",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "URL IMAGE",
          "fontface": 1,
          "fontsize": 12.0,
          "textcolor": [0.92, 0.94, 0.96, 1.0],
          "patching_rect": [42.0, 925.0, 95.0, 22.0],
          "presentation": 1,
          "presentation_rect": [42.0, 971.0, 95.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-text-edit",
          "maxclass": "textedit",
          "numinlets": 1,
          "numoutlets": 4,
          "outlettype": ["", "int", "", ""],
          "keymode": 1,
          "outputmode": 1,
          "lines": 1,
          "readonly": 0,
          "nosymquotes": 1,
          "border": 3.0,
          "rounded": 6.0,
          "text": "COLLAB-HUB LAB",
          "fontsize": 16.0,
          "textcolor": [0.92, 0.94, 0.96, 1.0],
          "bgcolor": [0.09, 0.118, 0.153, 1.0],
          "bordercolor": [0.18, 0.24, 0.31, 1.0],
          "patching_rect": [145.0, 870.0, 660.0, 40.0],
          "presentation": 1,
          "presentation_rect": [142.0, 915.0, 660.0, 40.0]
        }
      },
      {
        "box": {
          "id": "obj-url-edit",
          "maxclass": "textedit",
          "numinlets": 1,
          "numoutlets": 4,
          "outlettype": ["", "int", "", ""],
          "keymode": 1,
          "outputmode": 1,
          "lines": 1,
          "readonly": 0,
          "nosymquotes": 1,
          "border": 3.0,
          "rounded": 6.0,
          "text": "/images/ezdac.png",
          "fontsize": 15.0,
          "textcolor": [0.92, 0.94, 0.96, 1.0],
          "bgcolor": [0.09, 0.118, 0.153, 1.0],
          "bordercolor": [0.18, 0.24, 0.31, 1.0],
          "patching_rect": [145.0, 920.0, 660.0, 40.0],
          "presentation": 1,
          "presentation_rect": [142.0, 965.0, 660.0, 40.0]
        }
      },
      {
        "box": {
          "id": "obj-font-label",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "TAILLE PX",
          "fontface": 1,
          "fontsize": 11.0,
          "textcolor": [0.92, 0.94, 0.96, 1.0],
          "patching_rect": [42.0, 970.0, 235.0, 22.0],
          "presentation": 1,
          "presentation_rect": [42.0, 1016.0, 85.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-font-number",
          "maxclass": "number",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["", "bang"],
          "minimum": 0,
          "maximum": 96,
          "fontsize": 16.0,
          "textcolor": [0.92, 0.94, 0.96, 1.0],
          "bgcolor": [0.09, 0.118, 0.153, 1.0],
          "bordercolor": [0.30, 0.82, 0.96, 1.0],
          "patching_rect": [285.0, 965.0, 90.0, 28.0],
          "presentation": 1,
          "presentation_rect": [130.0, 1010.0, 65.0, 31.0]
        }
      },
      {
        "box": {
          "id": "obj-palette-label",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "PRESET",
          "fontface": 1,
          "fontsize": 11.0,
          "textcolor": [0.92, 0.94, 0.96, 1.0],
          "patching_rect": [215.0, 1016.0, 58.0, 22.0],
          "presentation": 1,
          "presentation_rect": [215.0, 1016.0, 58.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-palette-menu",
          "maxclass": "umenu",
          "numinlets": 1,
          "numoutlets": 3,
          "outlettype": ["int", "", ""],
          "items": ["default", ",", "ocean", ",", "amber", ",", "cyan", ",", "paper"],
          "fontsize": 13.0,
          "patching_rect": [275.0, 1010.0, 125.0, 31.0],
          "presentation": 1,
          "presentation_rect": [275.0, 1010.0, 125.0, 31.0]
        }
      },
      {
        "box": {
          "id": "obj-prepend-palette",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend palette",
          "patching_rect": [275.0, 1055.0, 115.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-pick-background",
          "maxclass": "textbutton",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["", ""],
          "text": "COULEUR FOND...",
          "mode": 0,
          "outputmode": 1,
          "fontsize": 12.0,
          "bgcolor": [0.09, 0.118, 0.153, 1.0],
          "bordercolor": [0.30, 0.82, 0.96, 1.0],
          "patching_rect": [420.0, 1010.0, 170.0, 31.0],
          "presentation": 1,
          "presentation_rect": [420.0, 1010.0, 170.0, 31.0]
        }
      },
      {
        "box": {
          "id": "obj-pick-foreground",
          "maxclass": "textbutton",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["", ""],
          "text": "COULEUR TEXTE...",
          "mode": 0,
          "outputmode": 1,
          "fontsize": 12.0,
          "bgcolor": [0.09, 0.118, 0.153, 1.0],
          "bordercolor": [0.30, 0.82, 0.96, 1.0],
          "patching_rect": [605.0, 1010.0, 170.0, 31.0],
          "presentation": 1,
          "presentation_rect": [605.0, 1010.0, 170.0, 31.0]
        }
      },
      {
        "box": {
          "id": "obj-image-width-label",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "IMAGE WIDTH PX",
          "fontface": 1,
          "fontsize": 11.0,
          "textcolor": [0.92, 0.94, 0.96, 1.0],
          "patching_rect": [42.0, 1066.0, 110.0, 22.0],
          "presentation": 1,
          "presentation_rect": [42.0, 1066.0, 110.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-image-width-number",
          "maxclass": "number",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["", "bang"],
          "minimum": 0,
          "maximum": 2000,
          "fontsize": 16.0,
          "textcolor": [0.92, 0.94, 0.96, 1.0],
          "bgcolor": [0.09, 0.118, 0.153, 1.0],
          "bordercolor": [0.30, 0.82, 0.96, 1.0],
          "patching_rect": [155.0, 1060.0, 70.0, 31.0],
          "presentation": 1,
          "presentation_rect": [155.0, 1060.0, 70.0, 31.0]
        }
      },
      {
        "box": {
          "id": "obj-prepend-image-width",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend imagewidth",
          "patching_rect": [155.0, 1100.0, 145.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-set-image-width",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend set",
          "patching_rect": [310.0, 1100.0, 85.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-image-height-label",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "IMAGE HEIGHT PX",
          "fontface": 1,
          "fontsize": 11.0,
          "textcolor": [0.92, 0.94, 0.96, 1.0],
          "patching_rect": [250.0, 1066.0, 115.0, 22.0],
          "presentation": 1,
          "presentation_rect": [250.0, 1066.0, 115.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-image-height-number",
          "maxclass": "number",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["", "bang"],
          "minimum": 0,
          "maximum": 2000,
          "fontsize": 16.0,
          "textcolor": [0.92, 0.94, 0.96, 1.0],
          "bgcolor": [0.09, 0.118, 0.153, 1.0],
          "bordercolor": [0.30, 0.82, 0.96, 1.0],
          "patching_rect": [370.0, 1060.0, 70.0, 31.0],
          "presentation": 1,
          "presentation_rect": [370.0, 1060.0, 70.0, 31.0]
        }
      },
      {
        "box": {
          "id": "obj-prepend-image-height",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend imageheight",
          "patching_rect": [410.0, 1100.0, 150.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-set-image-height",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend set",
          "patching_rect": [570.0, 1100.0, 85.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-image-size-help",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "0 = AUTO · plage 1-2000 px · réglage du bloc actif",
          "fontsize": 11.0,
          "textcolor": [0.58, 0.65, 0.73, 1.0],
          "patching_rect": [465.0, 1066.0, 330.0, 22.0],
          "presentation": 1,
          "presentation_rect": [465.0, 1066.0, 330.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-prepend-font",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend fontsize",
          "patching_rect": [430.0, 640.0, 120.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-set-font",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend set",
          "patching_rect": [620.0, 1010.0, 85.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-send-all",
          "maxclass": "textbutton",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["", ""],
          "text": "SEND ALL TO WEB",
          "texton": "ENVOI EN COURS…",
          "mode": 0,
          "outputmode": 1,
          "fontface": 1,
          "fontsize": 15.0,
          "textcolor": [0.08, 0.06, 0.02, 1.0],
          "bgcolor": [1.0, 0.62, 0.08, 1.0],
          "bordercolor": [1.0, 0.78, 0.34, 1.0],
          "patching_rect": [835.0, 870.0, 255.0, 90.0],
          "presentation": 1,
          "presentation_rect": [836.0, 908.0, 260.0, 116.0]
        }
      },
      {
        "box": {
          "id": "obj-sendall-message",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "sendall",
          "patching_rect": [835.0, 975.0, 70.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-route-text-edit",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["", ""],
          "text": "route text",
          "patching_rect": [180.0, 615.0, 75.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-route-url-edit",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["", ""],
          "text": "route text",
          "patching_rect": [300.0, 615.0, 75.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-prepend-text",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend text",
          "patching_rect": [180.0, 640.0, 100.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-prepend-url",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend imageurl",
          "patching_rect": [300.0, 640.0, 120.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-preset-panel",
          "maxclass": "panel",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [25.0, 1130.0, 1090.0, 115.0],
          "presentation": 1,
          "presentation_rect": [24.0, 1118.0, 1096.0, 116.0],
          "background": 1,
          "bgcolor": [0.052, 0.068, 0.09, 1.0],
          "bordercolor": [0.30, 0.82, 0.96, 1.0]
        }
      },
      {
        "box": {
          "id": "obj-preset-title",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "PRESETS COMPLETS DES 8 BLOCS · JSON COMPATIBLE WEB",
          "fontface": 1,
          "fontsize": 13.0,
          "textcolor": [0.30, 0.82, 0.96, 1.0],
          "patching_rect": [42.0, 1140.0, 460.0, 22.0],
          "presentation": 1,
          "presentation_rect": [42.0, 1130.0, 460.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-preset-name-label",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "NOM + ENTRÉE",
          "fontface": 1,
          "fontsize": 11.0,
          "textcolor": [0.92, 0.94, 0.96, 1.0],
          "patching_rect": [42.0, 1173.0, 105.0, 22.0],
          "presentation": 1,
          "presentation_rect": [42.0, 1163.0, 105.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-preset-name",
          "maxclass": "textedit",
          "numinlets": 1,
          "numoutlets": 4,
          "outlettype": ["", "int", "", ""],
          "keymode": 1,
          "outputmode": 1,
          "lines": 1,
          "text": "Nouveau preset",
          "fontsize": 14.0,
          "textcolor": [0.92, 0.94, 0.96, 1.0],
          "bgcolor": [0.09, 0.118, 0.153, 1.0],
          "bordercolor": [0.18, 0.24, 0.31, 1.0],
          "patching_rect": [150.0, 1160.0, 245.0, 32.0],
          "presentation": 1,
          "presentation_rect": [150.0, 1157.0, 245.0, 32.0]
        }
      },
      {
        "box": {
          "id": "obj-route-preset-name",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["", ""],
          "text": "route text",
          "patching_rect": [150.0, 1200.0, 75.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-prepend-preset-name",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend presetname",
          "patching_rect": [235.0, 1200.0, 145.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-save-preset",
          "maxclass": "textbutton",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["", ""],
          "text": "SAVE / UPDATE",
          "mode": 0,
          "outputmode": 1,
          "fontsize": 12.0,
          "bgcolor": [0.08, 0.30, 0.40, 1.0],
          "bordercolor": [0.30, 0.82, 0.96, 1.0],
          "patching_rect": [410.0, 1160.0, 135.0, 32.0],
          "presentation": 1,
          "presentation_rect": [410.0, 1157.0, 135.0, 32.0]
        }
      },
      {
        "box": {
          "id": "obj-save-preset-message",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "savepreset",
          "patching_rect": [410.0, 1200.0, 85.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-recall-menu",
          "maxclass": "umenu",
          "numinlets": 1,
          "numoutlets": 3,
          "outlettype": ["int", "", ""],
          "items": [],
          "fontsize": 13.0,
          "patching_rect": [560.0, 1160.0, 190.0, 32.0],
          "presentation": 1,
          "presentation_rect": [560.0, 1157.0, 190.0, 32.0]
        }
      },
      {
        "box": {
          "id": "obj-prepend-recall-preset",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend recallpreset",
          "patching_rect": [560.0, 1200.0, 150.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-export-json",
          "maxclass": "textbutton",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["", ""],
          "text": "EXPORT JSON",
          "mode": 0,
          "outputmode": 1,
          "fontsize": 11.0,
          "patching_rect": [765.0, 1160.0, 145.0, 32.0],
          "presentation": 1,
          "presentation_rect": [765.0, 1157.0, 145.0, 32.0]
        }
      },
      {
        "box": {
          "id": "obj-savedialog-json",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 3,
          "outlettype": ["", "", "bang"],
          "text": "savedialog TEXT",
          "patching_rect": [765.0, 1200.0, 120.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-prepend-export-json",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend exportjson",
          "patching_rect": [895.0, 1200.0, 135.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-import-json",
          "maxclass": "textbutton",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["", ""],
          "text": "IMPORT JSON",
          "mode": 0,
          "outputmode": 1,
          "fontsize": 11.0,
          "patching_rect": [925.0, 1160.0, 145.0, 32.0],
          "presentation": 1,
          "presentation_rect": [925.0, 1157.0, 145.0, 32.0]
        }
      },
      {
        "box": {
          "id": "obj-opendialog-json",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["", "bang"],
          "text": "opendialog .json",
          "patching_rect": [925.0, 1230.0, 120.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-prepend-import-json",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend importjson",
          "patching_rect": [1055.0, 1230.0, 135.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-preset-status",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "Aucun preset enregistré",
          "fontsize": 10.5,
          "textcolor": [0.24, 0.84, 0.64, 1.0],
          "patching_rect": [42.0, 1210.0, 690.0, 20.0],
          "presentation": 1,
          "presentation_rect": [42.0, 1203.0, 690.0, 20.0]
        }
      },
      {
        "box": {
          "id": "obj-route-preset-menu",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 4,
          "outlettype": ["", "", "", ""],
          "text": "route presetmenuclear presetmenuappend presetstatus",
          "patching_rect": [305.0, 1260.0, 335.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-clear-preset-menu",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "clear",
          "patching_rect": [650.0, 1260.0, 45.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-append-preset-menu",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend append",
          "patching_rect": [705.0, 1260.0, 105.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-set-preset-status",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend set",
          "patching_rect": [820.0, 1260.0, 85.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-client-label",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "CONNEXION COLLAB-HUB",
          "fontface": 1,
          "fontsize": 13.0,
          "textcolor": [0.92, 0.94, 0.96, 1.0],
          "patching_rect": [25.0, 670.0, 250.0, 22.0],
          "presentation": 1,
          "presentation_rect": [24.0, 1255.0, 250.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-client",
          "maxclass": "bpatcher",
          "name": "ch.client.maxpat",
          "numinlets": 2,
          "numoutlets": 2,
          "outlettype": ["", ""],
          "bgmode": 0,
          "border": 0,
          "clickthrough": 0,
          "enablehscroll": 0,
          "enablevscroll": 0,
          "lockeddragscroll": 0,
          "lockedsize": 1,
          "offset": [0.0, 0.0],
          "patching_rect": [25.0, 700.0, 365.0, 158.0],
          "presentation": 1,
          "presentation_rect": [24.0, 1282.0, 365.0, 158.0]
        }
      },
      {
        "box": {
          "id": "obj-help-panel",
          "maxclass": "panel",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [415.0, 700.0, 700.0, 158.0],
          "presentation": 1,
          "presentation_rect": [410.0, 1282.0, 710.0, 158.0],
          "background": 1,
          "bgcolor": [0.067, 0.086, 0.115, 1.0],
          "bordercolor": [0.18, 0.24, 0.31, 1.0]
        }
      },
      {
        "box": {
          "id": "obj-help-title",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "MODE D'EMPLOI",
          "fontface": 1,
          "fontsize": 13.0,
          "textcolor": [0.30, 0.82, 0.96, 1.0],
          "patching_rect": [435.0, 715.0, 180.0, 22.0],
          "presentation": 1,
          "presentation_rect": [432.0, 1298.0, 180.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-help",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "linecount": 6,
          "text": "1. Connecte le CH Client, puis ouvre le site local.\n2. Choisis un bloc parmi les 8 index fixes.\n3. Écris un texte ou une URL puis presse Entrée.\n4. Les contrôles natifs règlent typo, preset, couleurs, WIDTH et HEIGHT.\n5. BASIC/COLOR/LINK/LAYOUT/LONG testent le Markdown sécurisé.\n6. Une valeur 0 restaure la taille automatique/par défaut.\n7. SEND ALL enregistre avec publish puis livre avec push.",
          "fontsize": 11.5,
          "textcolor": [0.76, 0.80, 0.85, 1.0],
          "patching_rect": [435.0, 742.0, 650.0, 105.0],
          "presentation": 1,
          "presentation_rect": [432.0, 1325.0, 660.0, 105.0]
        }
      },
      {
        "box": {
          "id": "obj-sender",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["", ""],
          "text": "js CollabHub_54_55_Lab_Sender.js",
          "saved_object_attributes": {
            "filename": "CollabHub_54_55_Lab_Sender.js",
            "parameter_enable": 0
          },
          "patching_rect": [25.0, 900.0, 260.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-route-status",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 3,
          "outlettype": ["", "", ""],
          "text": "route serverMessage connected",
          "patching_rect": [325.0, 900.0, 200.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-connection",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend connection",
          "patching_rect": [545.0, 940.0, 135.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-route-fields",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 8,
          "outlettype": ["", "", "", "", "", "", "", ""],
          "text": "route fieldtext fieldurl fontvalue imagewidthvalue imageheightvalue cleartext clearurl",
          "patching_rect": [305.0, 980.0, 505.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-colorpicker-background",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["list", "bang"],
          "text": "colorpicker",
          "patching_rect": [745.0, 980.0, 94.0, 23.0]
        }
      },
      {
        "box": {
          "id": "obj-prepend-custombackground",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend custombackground",
          "patching_rect": [785.0, 985.0, 180.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-colorpicker-foreground",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["list", "bang"],
          "text": "colorpicker",
          "patching_rect": [745.0, 1020.0, 94.0, 23.0]
        }
      },
      {
        "box": {
          "id": "obj-prepend-customforeground",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend customforeground",
          "patching_rect": [785.0, 1025.0, 180.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-clear-text",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "set",
          "patching_rect": [650.0, 970.0, 40.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-clear-url",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "set",
          "patching_rect": [650.0, 1010.0, 40.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-set-text",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend set",
          "patching_rect": [520.0, 970.0, 85.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-set-url",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "prepend set",
          "patching_rect": [520.0, 1010.0, 85.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-loadbang",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": ["bang"],
          "text": "loadbang",
          "patching_rect": [25.0, 980.0, 65.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-init-block",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "block snd_show",
          "patching_rect": [110.0, 980.0, 110.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-auto-connect-delay",
          "maxclass": "newobj",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": ["bang"],
          "text": "delay 750",
          "patching_rect": [110.0, 1020.0, 70.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-auto-connect",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "connect 1",
          "patching_rect": [200.0, 1020.0, 60.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-print-send",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "print CollabHub-54-55-Send",
          "patching_rect": [25.0, 940.0, 205.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-print-status",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "print CollabHub-54-55-Status",
          "patching_rect": [705.0, 900.0, 215.0, 22.0]
        }
      }
    ],
    "lines": [
      {"patchline": {"source": ["obj-ui", 0], "destination": ["obj-sender", 0]}},
      {"patchline": {"source": ["obj-preset-name", 0], "destination": ["obj-route-preset-name", 0]}},
      {"patchline": {"source": ["obj-route-preset-name", 0], "destination": ["obj-prepend-preset-name", 0]}},
      {"patchline": {"source": ["obj-route-preset-name", 1], "destination": ["obj-prepend-preset-name", 0]}},
      {"patchline": {"source": ["obj-prepend-preset-name", 0], "destination": ["obj-sender", 0]}},
      {"patchline": {"source": ["obj-save-preset", 0], "destination": ["obj-save-preset-message", 0]}},
      {"patchline": {"source": ["obj-save-preset-message", 0], "destination": ["obj-sender", 0]}},
      {"patchline": {"source": ["obj-recall-menu", 1], "destination": ["obj-prepend-recall-preset", 0]}},
      {"patchline": {"source": ["obj-prepend-recall-preset", 0], "destination": ["obj-sender", 0]}},
      {"patchline": {"source": ["obj-export-json", 0], "destination": ["obj-savedialog-json", 0]}},
      {"patchline": {"source": ["obj-savedialog-json", 0], "destination": ["obj-prepend-export-json", 0]}},
      {"patchline": {"source": ["obj-prepend-export-json", 0], "destination": ["obj-sender", 0]}},
      {"patchline": {"source": ["obj-import-json", 0], "destination": ["obj-opendialog-json", 0]}},
      {"patchline": {"source": ["obj-opendialog-json", 0], "destination": ["obj-prepend-import-json", 0]}},
      {"patchline": {"source": ["obj-prepend-import-json", 0], "destination": ["obj-sender", 0]}},
      {"patchline": {"source": ["obj-text-edit", 0], "destination": ["obj-route-text-edit", 0]}},
      {"patchline": {"source": ["obj-route-text-edit", 0], "destination": ["obj-prepend-text", 0]}},
      {"patchline": {"source": ["obj-route-text-edit", 1], "destination": ["obj-prepend-text", 0]}},
      {"patchline": {"source": ["obj-prepend-text", 0], "destination": ["obj-sender", 0]}},
      {"patchline": {"source": ["obj-url-edit", 0], "destination": ["obj-route-url-edit", 0]}},
      {"patchline": {"source": ["obj-route-url-edit", 0], "destination": ["obj-prepend-url", 0]}},
      {"patchline": {"source": ["obj-route-url-edit", 1], "destination": ["obj-prepend-url", 0]}},
      {"patchline": {"source": ["obj-prepend-url", 0], "destination": ["obj-sender", 0]}},
      {"patchline": {"source": ["obj-font-number", 0], "destination": ["obj-prepend-font", 0]}},
      {"patchline": {"source": ["obj-prepend-font", 0], "destination": ["obj-sender", 0]}},
      {"patchline": {"source": ["obj-image-width-number", 0], "destination": ["obj-prepend-image-width", 0]}},
      {"patchline": {"source": ["obj-prepend-image-width", 0], "destination": ["obj-sender", 0]}},
      {"patchline": {"source": ["obj-image-height-number", 0], "destination": ["obj-prepend-image-height", 0]}},
      {"patchline": {"source": ["obj-prepend-image-height", 0], "destination": ["obj-sender", 0]}},
      {"patchline": {"source": ["obj-palette-menu", 1], "destination": ["obj-prepend-palette", 0]}},
      {"patchline": {"source": ["obj-prepend-palette", 0], "destination": ["obj-sender", 0]}},
      {"patchline": {"source": ["obj-pick-background", 0], "destination": ["obj-colorpicker-background", 0]}},
      {"patchline": {"source": ["obj-pick-foreground", 0], "destination": ["obj-colorpicker-foreground", 0]}},
      {"patchline": {"source": ["obj-send-all", 0], "destination": ["obj-sendall-message", 0]}},
      {"patchline": {"source": ["obj-sendall-message", 0], "destination": ["obj-sender", 0]}},
      {"patchline": {"source": ["obj-sender", 0], "destination": ["obj-client", 0], "order": 0}},
      {"patchline": {"source": ["obj-sender", 0], "destination": ["obj-print-send", 0], "order": 1}},
      {"patchline": {"source": ["obj-sender", 1], "destination": ["obj-ui", 0], "order": 0}},
      {"patchline": {"source": ["obj-sender", 1], "destination": ["obj-route-fields", 0], "order": 1}},
      {"patchline": {"source": ["obj-sender", 1], "destination": ["obj-route-preset-menu", 0], "order": 2}},
      {"patchline": {"source": ["obj-route-preset-menu", 0], "destination": ["obj-clear-preset-menu", 0]}},
      {"patchline": {"source": ["obj-route-preset-menu", 1], "destination": ["obj-append-preset-menu", 0]}},
      {"patchline": {"source": ["obj-route-preset-menu", 2], "destination": ["obj-set-preset-status", 0]}},
      {"patchline": {"source": ["obj-clear-preset-menu", 0], "destination": ["obj-recall-menu", 0]}},
      {"patchline": {"source": ["obj-append-preset-menu", 0], "destination": ["obj-recall-menu", 0]}},
      {"patchline": {"source": ["obj-set-preset-status", 0], "destination": ["obj-preset-status", 0]}},
      {"patchline": {"source": ["obj-route-fields", 0], "destination": ["obj-set-text", 0]}},
      {"patchline": {"source": ["obj-route-fields", 1], "destination": ["obj-set-url", 0]}},
      {"patchline": {"source": ["obj-route-fields", 2], "destination": ["obj-set-font", 0]}},
      {"patchline": {"source": ["obj-route-fields", 3], "destination": ["obj-set-image-width", 0]}},
      {"patchline": {"source": ["obj-route-fields", 4], "destination": ["obj-set-image-height", 0]}},
      {"patchline": {"source": ["obj-route-fields", 5], "destination": ["obj-clear-text", 0]}},
      {"patchline": {"source": ["obj-route-fields", 6], "destination": ["obj-clear-url", 0]}},
      {"patchline": {"source": ["obj-clear-text", 0], "destination": ["obj-text-edit", 0]}},
      {"patchline": {"source": ["obj-clear-url", 0], "destination": ["obj-url-edit", 0]}},
      {"patchline": {"source": ["obj-colorpicker-background", 0], "destination": ["obj-prepend-custombackground", 0]}},
      {"patchline": {"source": ["obj-prepend-custombackground", 0], "destination": ["obj-sender", 0]}},
      {"patchline": {"source": ["obj-colorpicker-foreground", 0], "destination": ["obj-prepend-customforeground", 0]}},
      {"patchline": {"source": ["obj-prepend-customforeground", 0], "destination": ["obj-sender", 0]}},
      {"patchline": {"source": ["obj-set-text", 0], "destination": ["obj-text-edit", 0]}},
      {"patchline": {"source": ["obj-set-url", 0], "destination": ["obj-url-edit", 0]}},
      {"patchline": {"source": ["obj-set-font", 0], "destination": ["obj-font-number", 0]}},
      {"patchline": {"source": ["obj-set-image-width", 0], "destination": ["obj-image-width-number", 0]}},
      {"patchline": {"source": ["obj-set-image-height", 0], "destination": ["obj-image-height-number", 0]}},
      {"patchline": {"source": ["obj-loadbang", 0], "destination": ["obj-init-block", 0]}},
      {"patchline": {"source": ["obj-loadbang", 0], "destination": ["obj-auto-connect-delay", 0]}},
      {"patchline": {"source": ["obj-init-block", 0], "destination": ["obj-sender", 0]}},
      {"patchline": {"source": ["obj-auto-connect-delay", 0], "destination": ["obj-auto-connect", 0]}},
      {"patchline": {"source": ["obj-auto-connect", 0], "destination": ["obj-client", 0]}},
      {"patchline": {"source": ["obj-client", 0], "destination": ["obj-route-status", 0], "order": 0}},
      {"patchline": {"source": ["obj-client", 0], "destination": ["obj-print-status", 0], "order": 1}},
      {"patchline": {"source": ["obj-route-status", 1], "destination": ["obj-connection", 0]}},
      {"patchline": {"source": ["obj-connection", 0], "destination": ["obj-ui", 0]}}
    ],
    "dependency_cache": [
      {"name": "ch.client.maxpat", "bootpath": "~/Documents/Max 9/Packages/Collab-Hub/patchers", "patcherrelativepath": "../../Max 9/Packages/Collab-Hub/patchers", "type": "JSON", "implicit": 1},
      {"name": "CollabHub_54_55_Lab_UI.js", "bootpath": ".", "patcherrelativepath": ".", "type": "TEXT", "implicit": 1},
      {"name": "CollabHub_54_55_Lab_Sender.js", "bootpath": ".", "patcherrelativepath": ".", "type": "TEXT", "implicit": 1}
    ],
    "autosave": 0
  }
}
