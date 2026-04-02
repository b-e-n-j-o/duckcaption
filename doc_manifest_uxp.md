# Guide Complet : Manifest UXP pour Premiere Pro

## Vue d'ensemble

Le fichier `manifest.json` est **obligatoire** pour tout plugin UXP. Il doit être à la **racine** du dossier du plugin et contient toutes les métadonnées et permissions.

---

## Structure de base

```json
{
  "manifestVersion": 5,
  "id": "com.company.pluginname",
  "name": "Plugin Name",
  "version": "1.0.0",
  "main": "index.html",
  "host": {
    "app": "premierepro",
    "minVersion": "25.0"
  },
  "requiredPermissions": {},
  "entrypoints": []
}
```

---

## Propriétés obligatoires

### `manifestVersion`
- **Type** : `string`
- **Valeur** : `"5"` (toujours 5 pour Premiere Pro)
- **Description** : Version du schéma de manifest

```json
"manifestVersion": 5
```

---

### `id`
- **Type** : `string`
- **Format** : Reverse domain notation (ex: `com.duckmotion.transcription`)
- **Description** : Identifiant unique du plugin
- **Important** : Doit correspondre à l'ID sur Adobe Marketplace si vous distribuez le plugin

```json
"id": "com.duckmotion.transcription"
```

---

### `name`
- **Type** : `string` ou `LocalizedString`
- **Description** : Nom du plugin affiché dans Premiere Pro

```json
"name": "Duckmotion Transcription"
```

Ou avec localisation :
```json
"name": "my-plugin-key",
"strings": {
  "my-plugin-key": {
    "default": "My Plugin",
    "fr": "Mon Plugin",
    "es": "Mi Plugin"
  }
}
```

---

### `version`
- **Type** : `string`
- **Format** : `major.minor.patch` (ex: `1.0.0`)
- **Description** : Version du plugin

```json
"version": "1.0.0"
```

---

### `host`
- **Type** : `object`
- **Description** : Compatibilité avec l'application hôte

```json
"host": {
  "app": "premierepro",
  "minVersion": "25.0",
  "maxVersion": "26.9"  // Optionnel
}
```

**Applications supportées** :
- `"premierepro"` : Adobe Premiere Pro
- `"PS"` : Adobe Photoshop
- `"ID"` : Adobe InDesign
- `"XD"` : Adobe XD

---

### `entrypoints`
- **Type** : `array`
- **Description** : Points d'entrée du plugin (panels, commandes)

#### Panel (interface persistante)
```json
"entrypoints": [
  {
    "type": "panel",
    "id": "mainPanel",
    "label": {
      "default": "My Panel"
    },
    "minimumSize": {
      "width": 300,
      "height": 400
    },
    "maximumSize": {
      "width": 2000,
      "height": 2000
    }
  }
]
```

#### Command (action ponctuelle)
```json
"entrypoints": [
  {
    "type": "command",
    "id": "myCommand",
    "label": {
      "default": "Execute Command"
    }
  }
]
```

---

## Propriétés optionnelles

### `main`
- **Type** : `string`
- **Défaut** : `"main.js"`
- **Description** : Fichier principal (HTML ou JS)

```json
"main": "index.html"
```

---

### `icons`
- **Type** : `array`
- **Description** : Icônes du plugin

```json
"icons": [
  {
    "width": 32,
    "height": 32,
    "path": "icons/icon.png",
    "scale": [1, 2],
    "theme": ["dark", "darkest"],
    "species": ["generic"]
  }
]
```

**Thèmes disponibles** :
- `"lightest"`, `"light"`, `"medium"`, `"dark"`, `"darkest"`, `"all"`

**Species disponibles** :
- `"generic"` : Partout
- `"toolbar"` : Barre d'outils (23x23px)
- `"pluginList"` : Liste de plugins (24x24px)

---

### `requiredPermissions`
- **Type** : `object` ⚠️ **PAS un array !**
- **Description** : Permissions nécessaires au plugin

---

## Permissions détaillées

### ⚠️ RÈGLE CRITIQUE
**`requiredPermissions` est un OBJET `{}`, jamais un tableau `[]` !**

```json
// ✅ CORRECT
"requiredPermissions": {
  "network": { ... }
}

// ❌ INCORRECT
"requiredPermissions": [
  "network"
]
```

---

### `network` - Accès réseau

Permet les requêtes HTTP, fetch, chargement d'images, etc.

#### Accès à tous les domaines
```json
"requiredPermissions": {
  "network": {
    "domains": "all"
  }
}
```

#### Accès à des domaines spécifiques (RECOMMANDÉ)
```json
"requiredPermissions": {
  "network": {
    "domains": [
      "https://api.example.com",
      "https://*.mydomain.com",
      "wss://websocket.example.com"
    ]
  }
}
```

**Wildcards supportés** :
- `https://*.example.com` : Tous les sous-domaines
- `https://example.com/*` : Tous les chemins

---

### `localFileSystem` - Accès fichiers

Permet l'accès au système de fichiers.

```json
"requiredPermissions": {
  "localFileSystem": "fullAccess"
}
```

**Valeurs possibles** :
- `"plugin"` : Accès uniquement au dossier du plugin (défaut)
- `"request"` : Demande d'accès utilisateur (file picker)
- `"fullAccess"` : Accès complet au système

---

### `launchProcess` - Lancer des processus

Permet d'ouvrir des fichiers, URLs externes, etc.

```json
"requiredPermissions": {
  "launchProcess": {
    "schemes": ["http", "https", "mailto", "file"],
    "extensions": ["pdf", "png", "jpg", "wav", "mp4"]
  }
}
```

**Utilisation** :
```javascript
const { shell } = require('uxp');
shell.openExternal('https://example.com');
shell.openPath('/path/to/file.pdf');
```

---

### `clipboard` - Presse-papiers

Permet la lecture/écriture dans le presse-papiers.

```json
"requiredPermissions": {
  "clipboard": "readAndWrite"
}
```

**Valeurs possibles** :
- `"read"` : Lecture seule
- `"readAndWrite"` : Lecture et écriture

---

### `webview` - Webviews embarquées

Permet d'afficher du contenu web dans le plugin.

```json
"requiredPermissions": {
  "webview": {
    "allow": "yes",
    "domains": ["https://example.com"],
    "enableMessageBridge": "localAndRemote"
  }
}
```

---

### Autres permissions

```json
"requiredPermissions": {
  "allowCodeGenerationFromStrings": true,  // eval(), new Function()
  "enableUserInfo": true,                  // Accès au GUID utilisateur
  "ipc": {
    "enablePluginCommunication": true      // Communication inter-plugins
  }
}
```

---

## Exemple complet - Plugin de transcription

```json
{
  "manifestVersion": 5,
  "id": "com.duckmotion.transcription",
  "name": "Duckmotion Transcription",
  "version": "1.0.0",
  "main": "index.html",
  "host": {
    "app": "premierepro",
    "minVersion": "25.0"
  },
  "requiredPermissions": {
    "network": {
      "domains": [
        "https://backend-duckcaption.onrender.com",
        "https://*.supabase.co"
      ]
    },
    "localFileSystem": "fullAccess",
    "launchProcess": {
      "schemes": ["http", "https", "file"],
      "extensions": ["wav", "mp3", "mp4", "mov", "srt"]
    },
    "clipboard": "readAndWrite"
  },
  "entrypoints": [
    {
      "type": "panel",
      "id": "transcriptionPanel",
      "label": {
        "default": "Duckmotion"
      },
      "minimumSize": {
        "width": 300,
        "height": 400
      },
      "maximumSize": {
        "width": 1000,
        "height": 2000
      },
      "preferredDockedSize": {
        "width": 400,
        "height": 600
      }
    }
  ],
  "icons": [
    {
      "width": 32,
      "height": 32,
      "path": "icons/icon_D.png",
      "scale": [1, 2],
      "theme": ["dark", "darkest"]
    },
    {
      "width": 32,
      "height": 32,
      "path": "icons/icon_N.png",
      "scale": [1, 2],
      "theme": ["lightest", "light"]
    }
  ]
}
```

---

## Erreurs fréquentes et solutions

### ❌ Erreur : "requires objectValue or nullValue"
**Cause** : `requiredPermissions` est un tableau au lieu d'un objet

```json
// ❌ INCORRECT
"requiredPermissions": ["network", "localFileSystem"]

// ✅ CORRECT
"requiredPermissions": {
  "network": { "domains": "all" },
  "localFileSystem": "fullAccess"
}
```

---

### ❌ Erreur : "Plugin is not permitted to access network"
**Cause** : Domaine non déclaré dans `network.domains`

```json
// ✅ Ajoutez le domaine
"requiredPermissions": {
  "network": {
    "domains": ["https://votre-backend.com"]
  }
}
```

---

### ❌ Erreur : "Manifest entry not found"
**Cause** : UDT cherche le manifest dans le mauvais dossier

**Solution** : Le manifest doit être dans le dossier **racine** du plugin, pas dans un sous-dossier.

```
✅ CORRECT
plugin/
  ├── manifest.json    ← ICI
  ├── index.html
  └── index.js

❌ INCORRECT
plugin/
  └── src/
      ├── manifest.json    ← PAS ICI
      └── index.html
```

---

### ❌ Erreur : "Host application not available"
**Cause** : Mauvaise valeur dans `host.app`

```json
// ❌ INCORRECT
"host": { "app": "PR" }

// ✅ CORRECT pour Premiere Pro
"host": { "app": "premierepro" }
```

---

## Modifications du manifest

⚠️ **Important** : Toute modification du `manifest.json` nécessite un rechargement complet du plugin.

**Procédure** :
1. Modifiez le `manifest.json`
2. Dans UXP Developer Tool : **Unload** le plugin
3. Puis **Load & Watch** à nouveau

Le simple **Reload** ne suffit pas pour les changements de manifest !

---

## Bonnes pratiques

### 1. Permissions minimales
Ne demandez que les permissions **strictement nécessaires**.

```json
// ❌ Trop permissif
"network": { "domains": "all" }

// ✅ Restrictif et sécurisé
"network": { "domains": ["https://api.myapp.com"] }
```

---

### 2. Domaines spécifiques
Listez explicitement les domaines utilisés.

```json
"network": {
  "domains": [
    "https://backend.myapp.com",
    "https://cdn.myapp.com",
    "https://api.elevenlabs.io"
  ]
}
```

---

### 3. Extensions fichiers
Limitez aux formats réellement utilisés.

```json
"launchProcess": {
  "schemes": ["file", "https"],
  "extensions": ["srt", "vtt", "wav", "mp4"]  // Seulement ce dont vous avez besoin
}
```

---

### 4. Versioning
Respectez la sémantique versionnelle (semver).

```json
"version": "1.2.3"
// 1 = major (breaking changes)
// 2 = minor (nouvelles features)
// 3 = patch (bug fixes)
```

---

### 5. ID unique
Utilisez un reverse domain notation.

```json
// ✅ CORRECT
"id": "com.votrecompagnie.nomproduct"

// ❌ INCORRECT
"id": "my-plugin"
"id": "plugin_123"
```

---

## Validation du manifest

### Vérifier la syntaxe JSON
```bash
# En ligne de commande
cat manifest.json | python -m json.tool

# Ou utilisez un validateur en ligne
# https://jsonlint.com/
```

### Checklist avant déploiement
- [ ] `manifestVersion` = `5`
- [ ] `id` unique et en reverse domain
- [ ] `host.app` = `"premierepro"`
- [ ] `requiredPermissions` est un **objet** `{}`
- [ ] Tous les domaines réseau déclarés
- [ ] Extensions fichiers nécessaires listées
- [ ] Icons présents et chemins corrects
- [ ] Pas de virgules superflues
- [ ] Accolades/crochets bien fermés

---

## Ressources

- [Documentation officielle Adobe UXP](https://developer.adobe.com/premiere-pro/uxp/)
- [UXP Manifest Reference](https://developer.adobe.com/premiere-pro/uxp/resources/fundamentals/manifest/)
- [Exemples de plugins](https://github.com/AdobeDocs/uxp-premiere-pro-samples)

---

## Changelog template

Gardez trace des changements dans votre manifest :

```markdown
# Changelog

## [1.1.0] - 2026-04-02
### Added
- Permission `clipboard` pour copier/coller
- Domaine `https://new-api.com` dans network

### Changed
- `minVersion` de 25.0 à 25.6

## [1.0.0] - 2026-04-01
### Initial Release
- Panel principal
- Permissions network et localFileSystem
```

---

**🦆 Gardez ce guide à portée de main pour toute modification future du manifest !**