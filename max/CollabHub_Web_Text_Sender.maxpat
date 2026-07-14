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
    "rect": [
      60,
      80,
      1100,
      2250
    ],
    "gridsize": [
      15,
      15
    ],
    "boxes": [
      {
        "box": {
          "id": "obj-1",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            20,
            20,
            300,
            22
          ],
          "text": "COLLAB-HUB CONNECTION"
        }
      },
      {
        "box": {
          "id": "obj-2",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            20,
            46,
            560,
            48
          ],
          "text": "1) connecter Collab-Hub (bouton connect du CH-Client) ; 2) attendre le message serveur 0.3.4 ; 3) dans la page web, cliquer « Observer les 6 champs » ; 4) dans Max, cliquer « ENVOYER LES 6 CHAMPS ». Serveur attendu : https://server.collab-hub.io — version 0.3.4. Namespace = config.json du package (défaut « hub »)."
        }
      },
      {
        "box": {
          "id": "obj-3",
          "maxclass": "bpatcher",
          "name": "ch.client.maxpat",
          "numinlets": 2,
          "numoutlets": 2,
          "outlettype": [
            "",
            ""
          ],
          "bgmode": 0,
          "border": 0,
          "clickthrough": 0,
          "enablehscroll": 0,
          "enablevscroll": 0,
          "lockeddragscroll": 0,
          "lockedsize": 1,
          "offset": [
            0,
            0
          ],
          "patching_rect": [
            20,
            100,
            360,
            152
          ],
          "presentation": 1,
          "presentation_rect": [
            20,
            100,
            360,
            152
          ],
          "viewvisibility": 1
        }
      },
      {
        "box": {
          "id": "obj-4",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 3,
          "outlettype": [
            "",
            "",
            ""
          ],
          "patching_rect": [
            400,
            100,
            190,
            22
          ],
          "text": "route serverMessage connected"
        }
      },
      {
        "box": {
          "id": "obj-5",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            400,
            132,
            360,
            22
          ],
          "text": "— message serveur —"
        }
      },
      {
        "box": {
          "id": "obj-6",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            400,
            162,
            150,
            22
          ],
          "text": "— connected —"
        }
      },
      {
        "box": {
          "id": "obj-7",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 0,
          "outlettype": [],
          "patching_rect": [
            620,
            100,
            170,
            22
          ],
          "text": "print CollabHub-Status"
        }
      },
      {
        "box": {
          "id": "obj-8",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 0,
          "outlettype": [],
          "patching_rect": [
            760,
            250,
            210,
            22
          ],
          "text": "print CollabHub-Web-Sender"
        }
      },
      {
        "box": {
          "id": "obj-9",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            20,
            262,
            740,
            34
          ],
          "text": "CHAMPS ÉDITABLES  (les listes sont converties en un seul symbole avant publication : espaces et syntaxe Web conservés)"
        }
      },
      {
        "box": {
          "id": "obj-10",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            20,
            302,
            120,
            22
          ],
          "text": "sound_title"
        }
      },
      {
        "box": {
          "id": "obj-11",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            150,
            300,
            300,
            22
          ],
          "text": "\"Premier morceau\""
        }
      },
      {
        "box": {
          "id": "obj-12",
          "maxclass": "button",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            "bang"
          ],
          "parameter_enable": 0,
          "patching_rect": [
            470,
            298,
            76,
            26
          ]
        }
      },
      {
        "box": {
          "id": "obj-13",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            700,
            300,
            240,
            22
          ],
          "text": "prepend push all sound_title"
        }
      },
      {
        "box": {
          "id": "obj-14",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            560,
            328,
            380,
            22
          ],
          "text": "— dernier envoi —"
        }
      },
      {
        "box": {
          "id": "obj-15",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            472,
            278,
            70,
            18
          ],
          "text": "Envoyer"
        }
      },
      {
        "box": {
          "id": "obj-16",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            20,
            366,
            120,
            22
          ],
          "text": "sound_author"
        }
      },
      {
        "box": {
          "id": "obj-17",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            150,
            364,
            300,
            22
          ],
          "text": "\"Olivier Brodu\""
        }
      },
      {
        "box": {
          "id": "obj-18",
          "maxclass": "button",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            "bang"
          ],
          "parameter_enable": 0,
          "patching_rect": [
            470,
            362,
            76,
            26
          ]
        }
      },
      {
        "box": {
          "id": "obj-19",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            700,
            364,
            240,
            22
          ],
          "text": "prepend push all sound_author"
        }
      },
      {
        "box": {
          "id": "obj-20",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            560,
            392,
            380,
            22
          ],
          "text": "— dernier envoi —"
        }
      },
      {
        "box": {
          "id": "obj-21",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            472,
            342,
            70,
            18
          ],
          "text": "Envoyer"
        }
      },
      {
        "box": {
          "id": "obj-22",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            20,
            430,
            120,
            22
          ],
          "text": "sound_subtitle"
        }
      },
      {
        "box": {
          "id": "obj-23",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            150,
            428,
            300,
            22
          ],
          "text": "\"Étude générative pour synthétiseur FM\""
        }
      },
      {
        "box": {
          "id": "obj-24",
          "maxclass": "button",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            "bang"
          ],
          "parameter_enable": 0,
          "patching_rect": [
            470,
            426,
            76,
            26
          ]
        }
      },
      {
        "box": {
          "id": "obj-25",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            700,
            428,
            240,
            22
          ],
          "text": "prepend push all sound_subtitle"
        }
      },
      {
        "box": {
          "id": "obj-26",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            560,
            456,
            380,
            22
          ],
          "text": "— dernier envoi —"
        }
      },
      {
        "box": {
          "id": "obj-27",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            472,
            406,
            70,
            18
          ],
          "text": "Envoyer"
        }
      },
      {
        "box": {
          "id": "obj-28",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            20,
            494,
            120,
            22
          ],
          "text": "sound_description"
        }
      },
      {
        "box": {
          "id": "obj-29",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            150,
            492,
            300,
            22
          ],
          "text": "\"Pièce générative pilotée depuis Max avec Collab-Hub\""
        }
      },
      {
        "box": {
          "id": "obj-30",
          "maxclass": "button",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            "bang"
          ],
          "parameter_enable": 0,
          "patching_rect": [
            470,
            490,
            76,
            26
          ]
        }
      },
      {
        "box": {
          "id": "obj-31",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            700,
            492,
            240,
            22
          ],
          "text": "prepend push all sound_description"
        }
      },
      {
        "box": {
          "id": "obj-32",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            560,
            520,
            380,
            22
          ],
          "text": "— dernier envoi —"
        }
      },
      {
        "box": {
          "id": "obj-33",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            472,
            470,
            70,
            18
          ],
          "text": "Envoyer"
        }
      },
      {
        "box": {
          "id": "obj-34",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            20,
            558,
            120,
            22
          ],
          "text": "sound_link"
        }
      },
      {
        "box": {
          "id": "obj-35",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            150,
            556,
            300,
            22
          ],
          "text": "\"https://example.com\""
        }
      },
      {
        "box": {
          "id": "obj-36",
          "maxclass": "button",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            "bang"
          ],
          "parameter_enable": 0,
          "patching_rect": [
            470,
            554,
            76,
            26
          ]
        }
      },
      {
        "box": {
          "id": "obj-37",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            700,
            556,
            240,
            22
          ],
          "text": "prepend push all sound_link"
        }
      },
      {
        "box": {
          "id": "obj-38",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            560,
            584,
            380,
            22
          ],
          "text": "— dernier envoi —"
        }
      },
      {
        "box": {
          "id": "obj-39",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            472,
            534,
            70,
            18
          ],
          "text": "Envoyer"
        }
      },
      {
        "box": {
          "id": "obj-40",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            20,
            636,
            820,
            34
          ],
          "text": "ENVOYER LES 6 CHAMPS — 1er passage immédiat, 2e passage 300 ms plus tard. Chaque passage déclenche les 6 push via send/receive ch_pub6 (ordre déterministe). Les événements control sont reçus par la page web. 12 messages imprimés dans la console Max."
        }
      },
      {
        "box": {
          "id": "obj-41",
          "maxclass": "button",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            "bang"
          ],
          "parameter_enable": 0,
          "patching_rect": [
            20,
            676,
            210,
            32
          ]
        }
      },
      {
        "box": {
          "id": "obj-42",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            24,
            654,
            200,
            18
          ],
          "text": "ENVOYER LES 6 CHAMPS"
        }
      },
      {
        "box": {
          "id": "obj-43",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": [
            "bang",
            "bang"
          ],
          "patching_rect": [
            250,
            680,
            48,
            22
          ],
          "text": "t b b"
        }
      },
      {
        "box": {
          "id": "obj-47",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            20,
            756,
            820,
            34
          ],
          "text": "MESSAGES SENT TO COLLAB-HUB — chaque envoi est imprimé dans la console Max : « CollabHub-Web-Sender: push all sound_title Premier morceau »"
        }
      },
      {
        "box": {
          "id": "obj-48",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [
            20,
            792,
            620,
            20
          ],
          "text": "→ voir la console Max (objet print CollabHub-Web-Sender ci-dessus à droite)"
        }
      },
      {
        "box": {
          "id": "obj-49",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 0,
          "outlettype": [],
          "patching_rect": [
            320,
            680,
            90,
            22
          ],
          "text": "send ch_pub6"
        }
      },
      {
        "box": {
          "id": "obj-50",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            "bang"
          ],
          "patching_rect": [
            250,
            712,
            70,
            22
          ],
          "text": "delay 300"
        }
      },
      {
        "box": {
          "id": "obj-51",
          "maxclass": "newobj",
          "numinlets": 0,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            80,
            300,
            120,
            22
          ],
          "text": "receive ch_pub6"
        }
      },
      {
        "box": {
          "id": "obj-52",
          "maxclass": "newobj",
          "numinlets": 0,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            80,
            364,
            120,
            22
          ],
          "text": "receive ch_pub6"
        }
      },
      {
        "box": {
          "id": "obj-53",
          "maxclass": "newobj",
          "numinlets": 0,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            80,
            428,
            120,
            22
          ],
          "text": "receive ch_pub6"
        }
      },
      {
        "box": {
          "id": "obj-54",
          "maxclass": "newobj",
          "numinlets": 0,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            80,
            492,
            120,
            22
          ],
          "text": "receive ch_pub6"
        }
      },
      {
        "box": {
          "id": "obj-55",
          "maxclass": "newobj",
          "numinlets": 0,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            80,
            556,
            120,
            22
          ],
          "text": "receive ch_pub6"
        }
      },
      {
        "box": {
          "id": "obj-56",
          "maxclass": "comment",
          "patching_rect": [
            20,
            820,
            860,
            48
          ],
          "numinlets": 1,
          "numoutlets": 0,
          "text": "HEARTBEAT — publie sound_heartbeat toutes les 10 s tant que le CH-Client est connecté. connected 1 -> démarre le metro (toggle) + tick immédiat (sel 1 -> t b b : register puis deliver 300 ms) ; connected 0 -> arrête. Le premier heartbeat livré arrive ~0,3 s après la connexion."
        }
      },
      {
        "box": {
          "id": "obj-57",
          "maxclass": "toggle",
          "patching_rect": [
            20,
            884,
            24,
            24
          ],
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            "int"
          ],
          "parameter_enable": 0
        }
      },
      {
        "box": {
          "id": "obj-58",
          "maxclass": "newobj",
          "patching_rect": [
            56,
            886,
            90,
            22
          ],
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            "bang"
          ],
          "text": "metro 10000"
        }
      },
      {
        "box": {
          "id": "obj-59",
          "maxclass": "newobj",
          "patching_rect": [
            160,
            886,
            60,
            22
          ],
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": [
            "bang",
            "bang"
          ],
          "text": "sel 1"
        }
      },
      {
        "box": {
          "id": "obj-60",
          "maxclass": "newobj",
          "patching_rect": [
            240,
            886,
            48,
            22
          ],
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": [
            "bang",
            "bang"
          ],
          "text": "t b b"
        }
      },
      {
        "box": {
          "id": "obj-61",
          "maxclass": "newobj",
          "patching_rect": [
            240,
            918,
            70,
            22
          ],
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            "bang"
          ],
          "text": "delay 300"
        }
      },
      {
        "box": {
          "id": "obj-62",
          "maxclass": "message",
          "patching_rect": [
            330,
            918,
            280,
            22
          ],
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "text": "push all sound_heartbeat 1"
        }
      },
      {
        "box": {
          "id": "obj-63",
          "maxclass": "message",
          "patching_rect": [
            620,
            918,
            150,
            22
          ],
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "text": "— dernier envoi —"
        }
      },
      {
        "box": {
          "id": "obj-64",
          "maxclass": "newobj",
          "patching_rect": [560, 300, 100, 22],
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "tosymbol"
        }
      },
      {
        "box": {
          "id": "obj-65",
          "maxclass": "newobj",
          "patching_rect": [560, 364, 100, 22],
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "tosymbol"
        }
      },
      {
        "box": {
          "id": "obj-66",
          "maxclass": "newobj",
          "patching_rect": [560, 428, 100, 22],
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "tosymbol"
        }
      },
      {
        "box": {
          "id": "obj-67",
          "maxclass": "newobj",
          "patching_rect": [560, 492, 100, 22],
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "tosymbol"
        }
      },
      {
        "box": {
          "id": "obj-68",
          "maxclass": "newobj",
          "patching_rect": [560, 556, 100, 22],
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "tosymbol"
        }
      },
      {
        "box": {
          "id": "obj-69",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [20, 960, 900, 22],
          "text": "IMAGE DE PROGRAMME — modifier une valeur puis cliquer sa boîte message (deux fois pour un premier envoi), ou cliquer ENVOYER L'IMAGE."
        }
      },
      {
        "box": { "id": "obj-70", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 996, 120, 22], "text": "sound_image_url" }
      },
      {
        "box": { "id": "obj-71", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [""], "patching_rect": [150, 996, 300, 22], "text": "\"https://example.com/visuel.jpg\"" }
      },
      {
        "box": { "id": "obj-72", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [470, 996, 100, 22], "text": "tosymbol" }
      },
      {
        "box": { "id": "obj-73", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [590, 996, 260, 22], "text": "prepend push all sound_image_url" }
      },
      {
        "box": { "id": "obj-74", "maxclass": "newobj", "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [80, 996, 60, 22], "text": "receive ch_img7" }
      },
      {
        "box": { "id": "obj-75", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 1044, 120, 22], "text": "sound_image_visible" }
      },
      {
        "box": { "id": "obj-76", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [""], "patching_rect": [150, 1044, 300, 22], "text": "true" }
      },
      {
        "box": { "id": "obj-77", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [470, 1044, 100, 22], "text": "tosymbol" }
      },
      {
        "box": { "id": "obj-78", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [590, 1044, 280, 22], "text": "prepend push all sound_image_visible" }
      },
      {
        "box": { "id": "obj-79", "maxclass": "newobj", "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [80, 1044, 60, 22], "text": "receive ch_img7" }
      },
      {
        "box": { "id": "obj-80", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 1092, 120, 22], "text": "sound_image_width" }
      },
      {
        "box": { "id": "obj-81", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [""], "patching_rect": [150, 1092, 300, 22], "text": "100%" }
      },
      {
        "box": { "id": "obj-82", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [470, 1092, 100, 22], "text": "tosymbol" }
      },
      {
        "box": { "id": "obj-83", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [590, 1092, 270, 22], "text": "prepend push all sound_image_width" }
      },
      {
        "box": { "id": "obj-84", "maxclass": "newobj", "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [80, 1092, 60, 22], "text": "receive ch_img7" }
      },
      {
        "box": { "id": "obj-85", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 1140, 120, 22], "text": "sound_image_height" }
      },
      {
        "box": { "id": "obj-86", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [""], "patching_rect": [150, 1140, 300, 22], "text": "420px" }
      },
      {
        "box": { "id": "obj-87", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [470, 1140, 100, 22], "text": "tosymbol" }
      },
      {
        "box": { "id": "obj-88", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [590, 1140, 275, 22], "text": "prepend push all sound_image_height" }
      },
      {
        "box": { "id": "obj-89", "maxclass": "newobj", "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [80, 1140, 60, 22], "text": "receive ch_img7" }
      },
      {
        "box": { "id": "obj-90", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 1188, 120, 22], "text": "sound_image_fit" }
      },
      {
        "box": { "id": "obj-91", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [""], "patching_rect": [150, 1188, 300, 22], "text": "cover" }
      },
      {
        "box": { "id": "obj-92", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [470, 1188, 100, 22], "text": "tosymbol" }
      },
      {
        "box": { "id": "obj-93", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [590, 1188, 250, 22], "text": "prepend push all sound_image_fit" }
      },
      {
        "box": { "id": "obj-94", "maxclass": "newobj", "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [80, 1188, 60, 22], "text": "receive ch_img7" }
      },
      {
        "box": { "id": "obj-95", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 1236, 120, 22], "text": "sound_image_position" }
      },
      {
        "box": { "id": "obj-96", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [""], "patching_rect": [150, 1236, 300, 22], "text": "center" }
      },
      {
        "box": { "id": "obj-97", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [470, 1236, 100, 22], "text": "tosymbol" }
      },
      {
        "box": { "id": "obj-98", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [590, 1236, 280, 22], "text": "prepend push all sound_image_position" }
      },
      {
        "box": { "id": "obj-99", "maxclass": "newobj", "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [80, 1236, 60, 22], "text": "receive ch_img7" }
      },
      {
        "box": { "id": "obj-105", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 1284, 120, 22], "text": "sound_image_slot" }
      },
      {
        "box": { "id": "obj-106", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [""], "patching_rect": [150, 1284, 300, 22], "text": "after_subtitle" }
      },
      {
        "box": { "id": "obj-107", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [470, 1284, 100, 22], "text": "tosymbol" }
      },
      {
        "box": { "id": "obj-108", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [590, 1284, 270, 22], "text": "prepend push all sound_image_slot" }
      },
      {
        "box": { "id": "obj-109", "maxclass": "newobj", "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [80, 1284, 60, 22], "text": "receive ch_img7" }
      },
      {
        "box": { "id": "obj-100", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 1350, 200, 18], "text": "ENVOYER LES 7 CHAMPS IMAGE" }
      },
      {
        "box": { "id": "obj-101", "maxclass": "button", "numinlets": 1, "numoutlets": 1, "outlettype": ["bang"], "parameter_enable": 0, "patching_rect": [20, 1372, 210, 32] }
      },
      {
        "box": { "id": "obj-102", "maxclass": "newobj", "numinlets": 1, "numoutlets": 2, "outlettype": ["bang", "bang"], "patching_rect": [250, 1376, 48, 22], "text": "t b b" }
      },
      {
        "box": { "id": "obj-103", "maxclass": "newobj", "numinlets": 1, "numoutlets": 0, "outlettype": [], "patching_rect": [320, 1376, 100, 22], "text": "send ch_img7" }
      },
      {
        "box": { "id": "obj-104", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": ["bang"], "patching_rect": [250, 1408, 70, 22], "text": "delay 300" }
      },
      {
        "box": { "id": "obj-110", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 1470, 180, 22], "text": "sound_title_visible" }
      },
      {
        "box": { "id": "obj-111", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [""], "patching_rect": [210, 1470, 240, 22], "text": "true" }
      },
      {
        "box": { "id": "obj-112", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [470, 1470, 100, 22], "text": "tosymbol" }
      },
      {
        "box": { "id": "obj-113", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [590, 1470, 280, 22], "text": "prepend push all sound_title_visible" }
      },
      {
        "box": { "id": "obj-114", "maxclass": "newobj", "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [140, 1470, 60, 22], "text": "receive ch_vis6" }
      },
      {
        "box": { "id": "obj-115", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 1518, 180, 22], "text": "sound_author_visible" }
      },
      {
        "box": { "id": "obj-116", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [""], "patching_rect": [210, 1518, 240, 22], "text": "true" }
      },
      {
        "box": { "id": "obj-117", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [470, 1518, 100, 22], "text": "tosymbol" }
      },
      {
        "box": { "id": "obj-118", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [590, 1518, 290, 22], "text": "prepend push all sound_author_visible" }
      },
      {
        "box": { "id": "obj-119", "maxclass": "newobj", "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [140, 1518, 60, 22], "text": "receive ch_vis6" }
      },
      {
        "box": { "id": "obj-120", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 1566, 180, 22], "text": "sound_subtitle_visible" }
      },
      {
        "box": { "id": "obj-121", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [""], "patching_rect": [210, 1566, 240, 22], "text": "true" }
      },
      {
        "box": { "id": "obj-122", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [470, 1566, 100, 22], "text": "tosymbol" }
      },
      {
        "box": { "id": "obj-123", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [590, 1566, 300, 22], "text": "prepend push all sound_subtitle_visible" }
      },
      {
        "box": { "id": "obj-124", "maxclass": "newobj", "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [140, 1566, 60, 22], "text": "receive ch_vis6" }
      },
      {
        "box": { "id": "obj-125", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 1614, 180, 22], "text": "sound_description_visible" }
      },
      {
        "box": { "id": "obj-126", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [""], "patching_rect": [210, 1614, 240, 22], "text": "true" }
      },
      {
        "box": { "id": "obj-127", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [470, 1614, 100, 22], "text": "tosymbol" }
      },
      {
        "box": { "id": "obj-128", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [590, 1614, 315, 22], "text": "prepend push all sound_description_visible" }
      },
      {
        "box": { "id": "obj-129", "maxclass": "newobj", "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [140, 1614, 60, 22], "text": "receive ch_vis6" }
      },
      {
        "box": { "id": "obj-130", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 1662, 180, 22], "text": "sound_link_visible" }
      },
      {
        "box": { "id": "obj-131", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [""], "patching_rect": [210, 1662, 240, 22], "text": "true" }
      },
      {
        "box": { "id": "obj-132", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [470, 1662, 100, 22], "text": "tosymbol" }
      },
      {
        "box": { "id": "obj-133", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [590, 1662, 280, 22], "text": "prepend push all sound_link_visible" }
      },
      {
        "box": { "id": "obj-134", "maxclass": "newobj", "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [140, 1662, 60, 22], "text": "receive ch_vis6" }
      },
      {
        "box": { "id": "obj-135", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 1728, 230, 18], "text": "ENVOYER LES 6 VISIBILITÉS TEXTE" }
      },
      {
        "box": { "id": "obj-136", "maxclass": "button", "numinlets": 1, "numoutlets": 1, "outlettype": ["bang"], "parameter_enable": 0, "patching_rect": [20, 1750, 210, 32] }
      },
      {
        "box": { "id": "obj-137", "maxclass": "newobj", "numinlets": 1, "numoutlets": 2, "outlettype": ["bang", "bang"], "patching_rect": [250, 1754, 48, 22], "text": "t b b" }
      },
      {
        "box": { "id": "obj-138", "maxclass": "newobj", "numinlets": 1, "numoutlets": 0, "outlettype": [], "patching_rect": [320, 1754, 100, 22], "text": "send ch_vis6" }
      },
      {
        "box": { "id": "obj-139", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": ["bang"], "patching_rect": [250, 1786, 70, 22], "text": "delay 300" }
      },
      {
        "box": { "id": "obj-140", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 1850, 180, 22], "text": "sound_show_name" }
      },
      {
        "box": { "id": "obj-141", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [""], "patching_rect": [210, 1850, 300, 22], "text": "Radio 2" }
      },
      {
        "box": { "id": "obj-142", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [530, 1850, 100, 22], "text": "tosymbol" }
      },
      {
        "box": { "id": "obj-143", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [650, 1850, 250, 22], "text": "prepend push all sound_show_name" }
      },
      {
        "box": { "id": "obj-144", "maxclass": "newobj", "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [130, 1850, 70, 22], "text": "receive ch_pub6" }
      },
      {
        "box": { "id": "obj-145", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 1900, 180, 22], "text": "sound_show_name_visible" }
      },
      {
        "box": { "id": "obj-146", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [""], "patching_rect": [210, 1900, 300, 22], "text": "true" }
      },
      {
        "box": { "id": "obj-147", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [530, 1900, 100, 22], "text": "tosymbol" }
      },
      {
        "box": { "id": "obj-148", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [650, 1900, 280, 22], "text": "prepend push all sound_show_name_visible" }
      },
      {
        "box": { "id": "obj-149", "maxclass": "newobj", "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [130, 1900, 70, 22], "text": "receive ch_vis6" }
      },
      {
        "box": { "id": "obj-150", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 1960, 200, 22], "text": "sound_show_name_position" }
      },
      {
        "box": { "id": "obj-151", "maxclass": "message", "numinlets": 2, "numoutlets": 1, "outlettype": [""], "patching_rect": [230, 1960, 280, 22], "text": "top" }
      },
      {
        "box": { "id": "obj-152", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [530, 1960, 100, 22], "text": "tosymbol" }
      },
      {
        "box": { "id": "obj-153", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [650, 1960, 290, 22], "text": "prepend push all sound_show_name_position" }
      },
      {
        "box": { "id": "obj-154", "maxclass": "newobj", "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [150, 1960, 70, 22], "text": "receive ch_showpos1" }
      },
      {
        "box": { "id": "obj-155", "maxclass": "comment", "numinlets": 1, "numoutlets": 0, "patching_rect": [20, 2018, 300, 18], "text": "ENVOYER POSITION NOM D'ÉMISSION" }
      },
      {
        "box": { "id": "obj-156", "maxclass": "button", "numinlets": 1, "numoutlets": 1, "outlettype": ["bang"], "parameter_enable": 0, "patching_rect": [20, 2040, 210, 32] }
      },
      {
        "box": { "id": "obj-157", "maxclass": "newobj", "numinlets": 1, "numoutlets": 2, "outlettype": ["bang", "bang"], "patching_rect": [250, 2044, 48, 22], "text": "t b b" }
      },
      {
        "box": { "id": "obj-158", "maxclass": "newobj", "numinlets": 1, "numoutlets": 0, "outlettype": [], "patching_rect": [320, 2044, 130, 22], "text": "send ch_showpos1" }
      },
      {
        "box": { "id": "obj-159", "maxclass": "newobj", "numinlets": 1, "numoutlets": 1, "outlettype": ["bang"], "patching_rect": [250, 2076, 70, 22], "text": "delay 300" }
      }
    ],
    "lines": [
      {
        "patchline": {
          "destination": [
            "obj-7",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-3",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-4",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-3",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-5",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-4",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-6",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-4",
            1
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-11",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-12",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-64",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-11",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-13",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-64",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-3",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-13",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-8",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-13",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-14",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-13",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-17",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-18",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-65",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-17",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-19",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-65",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-3",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-19",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-8",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-19",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-20",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-19",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-23",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-24",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-66",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-23",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-25",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-66",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-3",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-25",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-8",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-25",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-26",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-25",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-29",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-30",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-67",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-29",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-31",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-67",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-3",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-31",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-8",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-31",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-32",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-31",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-35",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-36",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-68",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-35",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-37",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-68",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-3",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-37",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-8",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-37",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-38",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-37",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-43",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-41",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "obj-43",
            0
          ],
          "destination": [
            "obj-49",
            0
          ],
          "disabled": 0,
          "hidden": 0
        }
      },
      {
        "patchline": {
          "source": [
            "obj-43",
            1
          ],
          "destination": [
            "obj-50",
            0
          ],
          "disabled": 0,
          "hidden": 0
        }
      },
      {
        "patchline": {
          "source": [
            "obj-50",
            0
          ],
          "destination": [
            "obj-49",
            0
          ],
          "disabled": 0,
          "hidden": 0
        }
      },
      {
        "patchline": {
          "source": [
            "obj-51",
            0
          ],
          "destination": [
            "obj-11",
            0
          ],
          "disabled": 0,
          "hidden": 0
        }
      },
      {
        "patchline": {
          "source": [
            "obj-52",
            0
          ],
          "destination": [
            "obj-17",
            0
          ],
          "disabled": 0,
          "hidden": 0
        }
      },
      {
        "patchline": {
          "source": [
            "obj-53",
            0
          ],
          "destination": [
            "obj-23",
            0
          ],
          "disabled": 0,
          "hidden": 0
        }
      },
      {
        "patchline": {
          "source": [
            "obj-54",
            0
          ],
          "destination": [
            "obj-29",
            0
          ],
          "disabled": 0,
          "hidden": 0
        }
      },
      {
        "patchline": {
          "source": [
            "obj-55",
            0
          ],
          "destination": [
            "obj-35",
            0
          ],
          "disabled": 0,
          "hidden": 0
        }
      },
      {
        "patchline": {
          "source": [
            "obj-4",
            1
          ],
          "destination": [
            "obj-57",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "obj-4",
            1
          ],
          "destination": [
            "obj-59",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "obj-57",
            0
          ],
          "destination": [
            "obj-58",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "obj-58",
            0
          ],
          "destination": [
            "obj-62",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "obj-59",
            0
          ],
          "destination": [
            "obj-60",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "obj-60",
            0
          ],
          "destination": [
            "obj-62",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "obj-60",
            1
          ],
          "destination": [
            "obj-61",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "obj-61",
            0
          ],
          "destination": [
            "obj-62",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "obj-62",
            0
          ],
          "destination": [
            "obj-3",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "obj-62",
            0
          ],
          "destination": [
            "obj-8",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "obj-62",
            0
          ],
          "destination": [
            "obj-63",
            0
          ]
        }
      },
      {
        "patchline": { "source": ["obj-71", 0], "destination": ["obj-72", 0] }
      },
      {
        "patchline": { "source": ["obj-72", 0], "destination": ["obj-73", 0] }
      },
      {
        "patchline": { "source": ["obj-73", 0], "destination": ["obj-3", 0] }
      },
      {
        "patchline": { "source": ["obj-73", 0], "destination": ["obj-8", 0] }
      },
      {
        "patchline": { "source": ["obj-74", 0], "destination": ["obj-71", 0] }
      },
      {
        "patchline": { "source": ["obj-76", 0], "destination": ["obj-77", 0] }
      },
      {
        "patchline": { "source": ["obj-77", 0], "destination": ["obj-78", 0] }
      },
      {
        "patchline": { "source": ["obj-78", 0], "destination": ["obj-3", 0] }
      },
      {
        "patchline": { "source": ["obj-78", 0], "destination": ["obj-8", 0] }
      },
      {
        "patchline": { "source": ["obj-79", 0], "destination": ["obj-76", 0] }
      },
      {
        "patchline": { "source": ["obj-81", 0], "destination": ["obj-82", 0] }
      },
      {
        "patchline": { "source": ["obj-82", 0], "destination": ["obj-83", 0] }
      },
      {
        "patchline": { "source": ["obj-83", 0], "destination": ["obj-3", 0] }
      },
      {
        "patchline": { "source": ["obj-83", 0], "destination": ["obj-8", 0] }
      },
      {
        "patchline": { "source": ["obj-84", 0], "destination": ["obj-81", 0] }
      },
      {
        "patchline": { "source": ["obj-86", 0], "destination": ["obj-87", 0] }
      },
      {
        "patchline": { "source": ["obj-87", 0], "destination": ["obj-88", 0] }
      },
      {
        "patchline": { "source": ["obj-88", 0], "destination": ["obj-3", 0] }
      },
      {
        "patchline": { "source": ["obj-88", 0], "destination": ["obj-8", 0] }
      },
      {
        "patchline": { "source": ["obj-89", 0], "destination": ["obj-86", 0] }
      },
      {
        "patchline": { "source": ["obj-91", 0], "destination": ["obj-92", 0] }
      },
      {
        "patchline": { "source": ["obj-92", 0], "destination": ["obj-93", 0] }
      },
      {
        "patchline": { "source": ["obj-93", 0], "destination": ["obj-3", 0] }
      },
      {
        "patchline": { "source": ["obj-93", 0], "destination": ["obj-8", 0] }
      },
      {
        "patchline": { "source": ["obj-94", 0], "destination": ["obj-91", 0] }
      },
      {
        "patchline": { "source": ["obj-96", 0], "destination": ["obj-97", 0] }
      },
      {
        "patchline": { "source": ["obj-97", 0], "destination": ["obj-98", 0] }
      },
      {
        "patchline": { "source": ["obj-98", 0], "destination": ["obj-3", 0] }
      },
      {
        "patchline": { "source": ["obj-98", 0], "destination": ["obj-8", 0] }
      },
      {
        "patchline": { "source": ["obj-99", 0], "destination": ["obj-96", 0] }
      },
      {
        "patchline": { "source": ["obj-106", 0], "destination": ["obj-107", 0] }
      },
      {
        "patchline": { "source": ["obj-107", 0], "destination": ["obj-108", 0] }
      },
      {
        "patchline": { "source": ["obj-108", 0], "destination": ["obj-3", 0] }
      },
      {
        "patchline": { "source": ["obj-108", 0], "destination": ["obj-8", 0] }
      },
      {
        "patchline": { "source": ["obj-109", 0], "destination": ["obj-106", 0] }
      },
      {
        "patchline": { "source": ["obj-101", 0], "destination": ["obj-102", 0] }
      },
      {
        "patchline": { "source": ["obj-102", 0], "destination": ["obj-103", 0] }
      },
      {
        "patchline": { "source": ["obj-102", 1], "destination": ["obj-104", 0] }
      },
      {
        "patchline": { "source": ["obj-104", 0], "destination": ["obj-103", 0] }
      },
      { "patchline": { "source": ["obj-111", 0], "destination": ["obj-112", 0] } },
      { "patchline": { "source": ["obj-112", 0], "destination": ["obj-113", 0] } },
      { "patchline": { "source": ["obj-113", 0], "destination": ["obj-3", 0] } },
      { "patchline": { "source": ["obj-113", 0], "destination": ["obj-8", 0] } },
      { "patchline": { "source": ["obj-114", 0], "destination": ["obj-111", 0] } },
      { "patchline": { "source": ["obj-116", 0], "destination": ["obj-117", 0] } },
      { "patchline": { "source": ["obj-117", 0], "destination": ["obj-118", 0] } },
      { "patchline": { "source": ["obj-118", 0], "destination": ["obj-3", 0] } },
      { "patchline": { "source": ["obj-118", 0], "destination": ["obj-8", 0] } },
      { "patchline": { "source": ["obj-119", 0], "destination": ["obj-116", 0] } },
      { "patchline": { "source": ["obj-121", 0], "destination": ["obj-122", 0] } },
      { "patchline": { "source": ["obj-122", 0], "destination": ["obj-123", 0] } },
      { "patchline": { "source": ["obj-123", 0], "destination": ["obj-3", 0] } },
      { "patchline": { "source": ["obj-123", 0], "destination": ["obj-8", 0] } },
      { "patchline": { "source": ["obj-124", 0], "destination": ["obj-121", 0] } },
      { "patchline": { "source": ["obj-126", 0], "destination": ["obj-127", 0] } },
      { "patchline": { "source": ["obj-127", 0], "destination": ["obj-128", 0] } },
      { "patchline": { "source": ["obj-128", 0], "destination": ["obj-3", 0] } },
      { "patchline": { "source": ["obj-128", 0], "destination": ["obj-8", 0] } },
      { "patchline": { "source": ["obj-129", 0], "destination": ["obj-126", 0] } },
      { "patchline": { "source": ["obj-131", 0], "destination": ["obj-132", 0] } },
      { "patchline": { "source": ["obj-132", 0], "destination": ["obj-133", 0] } },
      { "patchline": { "source": ["obj-133", 0], "destination": ["obj-3", 0] } },
      { "patchline": { "source": ["obj-133", 0], "destination": ["obj-8", 0] } },
      { "patchline": { "source": ["obj-134", 0], "destination": ["obj-131", 0] } },
      { "patchline": { "source": ["obj-136", 0], "destination": ["obj-137", 0] } },
      { "patchline": { "source": ["obj-137", 0], "destination": ["obj-138", 0] } },
      { "patchline": { "source": ["obj-137", 1], "destination": ["obj-139", 0] } },
      { "patchline": { "source": ["obj-139", 0], "destination": ["obj-138", 0] } },
      { "patchline": { "source": ["obj-141", 0], "destination": ["obj-142", 0] } },
      { "patchline": { "source": ["obj-142", 0], "destination": ["obj-143", 0] } },
      { "patchline": { "source": ["obj-143", 0], "destination": ["obj-3", 0] } },
      { "patchline": { "source": ["obj-143", 0], "destination": ["obj-8", 0] } },
      { "patchline": { "source": ["obj-144", 0], "destination": ["obj-141", 0] } },
      { "patchline": { "source": ["obj-146", 0], "destination": ["obj-147", 0] } },
      { "patchline": { "source": ["obj-147", 0], "destination": ["obj-148", 0] } },
      { "patchline": { "source": ["obj-148", 0], "destination": ["obj-3", 0] } },
      { "patchline": { "source": ["obj-148", 0], "destination": ["obj-8", 0] } },
      { "patchline": { "source": ["obj-149", 0], "destination": ["obj-146", 0] } },
      { "patchline": { "source": ["obj-151", 0], "destination": ["obj-152", 0] } },
      { "patchline": { "source": ["obj-152", 0], "destination": ["obj-153", 0] } },
      { "patchline": { "source": ["obj-153", 0], "destination": ["obj-3", 0] } },
      { "patchline": { "source": ["obj-153", 0], "destination": ["obj-8", 0] } },
      { "patchline": { "source": ["obj-154", 0], "destination": ["obj-151", 0] } },
      { "patchline": { "source": ["obj-156", 0], "destination": ["obj-157", 0] } },
      { "patchline": { "source": ["obj-157", 0], "destination": ["obj-158", 0] } },
      { "patchline": { "source": ["obj-157", 1], "destination": ["obj-159", 0] } },
      { "patchline": { "source": ["obj-159", 0], "destination": ["obj-158", 0] } }
    ]
  }
}
