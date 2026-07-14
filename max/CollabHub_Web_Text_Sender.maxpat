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
      980,
      836
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
          "text": "1) connecter Collab-Hub (bouton connect du CH-Client) ; 2) attendre le message serveur 0.3.4 ; 3) dans la page web, cliquer « Observer les 5 champs » ; 4) dans Max, cliquer « ENVOYER LES 5 CHAMPS ». Serveur attendu : https://server.collab-hub.io — version 0.3.4. Namespace = config.json du package (défaut « hub »)."
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
          "text": "prepend publish all sound_title"
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
          "text": "prepend publish all sound_author"
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
          "text": "prepend publish all sound_subtitle"
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
          "text": "prepend publish all sound_description"
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
          "text": "prepend publish all sound_link"
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
          "text": "ENVOYER LES 5 CHAMPS — 1er passage (enregistrement) immédiat, 2e passage (livraison) 300 ms plus tard. Chaque passage déclenche les 5 publish via send/receive ch_pub5 (ordre déterministe). Le 2e passage déclenche les événements control reçus par la page web. 10 messages imprimés dans la console Max."
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
          "text": "ENVOYER LES 5 CHAMPS"
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
          "text": "MESSAGES SENT TO COLLAB-HUB — chaque envoi est imprimé dans la console Max : « CollabHub-Web-Sender: publish all sound_title Premier morceau »"
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
          "text": "send ch_pub5"
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
          "text": "receive ch_pub5"
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
          "text": "receive ch_pub5"
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
          "text": "receive ch_pub5"
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
          "text": "receive ch_pub5"
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
          "text": "receive ch_pub5"
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
          "text": "publish all sound_heartbeat 1"
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
      }
    ]
  }
}
