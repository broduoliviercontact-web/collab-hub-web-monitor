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
          "text": "CHAMPS ÉDITABLES  (conserver les guillemets autour du texte ; un seul symbole = valeur unique transmise telle quelle)"
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
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            560,
            300,
            360,
            22
          ],
          "text": "publish all sound_title $1"
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
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            560,
            364,
            360,
            22
          ],
          "text": "publish all sound_author $1"
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
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            560,
            428,
            360,
            22
          ],
          "text": "publish all sound_subtitle $1"
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
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            560,
            492,
            360,
            22
          ],
          "text": "publish all sound_description $1"
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
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            560,
            556,
            360,
            22
          ],
          "text": "publish all sound_link $1"
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
          "text": "ENVOYER LES 5 CHAMPS — 1er passage (enregistrement) à 0/50/100/150/200 ms, 2e passage (livraison) à 250/300/350/400/450 ms. Le 2e passage déclenche les événements control reçus par la page web."
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
          "id": "obj-44",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 5,
          "outlettype": [
            "bang",
            "bang",
            "bang",
            "bang",
            "bang"
          ],
          "patching_rect": [
            320,
            680,
            150,
            22
          ],
          "text": "pipe 0 50 100 150 200"
        }
      },
      {
        "box": {
          "id": "obj-45",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            "bang"
          ],
          "patching_rect": [
            250,
            712,
            60,
            22
          ],
          "text": "pipe 250"
        }
      },
      {
        "box": {
          "id": "obj-46",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 5,
          "outlettype": [
            "bang",
            "bang",
            "bang",
            "bang",
            "bang"
          ],
          "patching_rect": [
            320,
            712,
            150,
            22
          ],
          "text": "pipe 0 50 100 150 200"
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
            "obj-13",
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
            "obj-19",
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
            "obj-25",
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
            "obj-31",
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
            "obj-37",
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
          "destination": [
            "obj-44",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-43",
            0
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-45",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-43",
            1
          ]
        }
      },
      {
        "patchline": {
          "destination": [
            "obj-46",
            0
          ],
          "disabled": 0,
          "hidden": 0,
          "source": [
            "obj-45",
            0
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
            "obj-44",
            0
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
            "obj-46",
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
            "obj-44",
            1
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
            "obj-46",
            1
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
            "obj-44",
            2
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
            "obj-46",
            2
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
            "obj-44",
            3
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
            "obj-46",
            3
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
            "obj-44",
            4
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
            "obj-46",
            4
          ]
        }
      }
    ]
  }
}
