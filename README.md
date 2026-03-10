# 🎮 NEXUS ARENA — Guía de instalación completa

## ¿Qué es esto?
Tu plataforma de torneos privados de videojuegos. Página pública para inscripciones + panel admin para gestionar todo.

---

## PASO 1 — Configurar Firebase (10 minutos)

### 1.1 Crear proyecto
1. Entrá a https://firebase.google.com
2. Hacé clic en **"Comenzar"** o **"Go to console"**
3. Iniciá sesión con tu cuenta de Google
4. Clic en **"Agregar proyecto"**
5. Nombre: `nexus-arena` (o el que quieras)
6. Desactivá Google Analytics (no lo necesitás)
7. Clic en **"Crear proyecto"**

### 1.2 Crear base de datos (Firestore)
1. En el panel de Firebase, menú izquierdo → **"Firestore Database"**
2. Clic en **"Crear base de datos"**
3. Elegí **"Iniciar en modo de prueba"** (vas a cambiarlo después)
4. Elegí la ubicación más cercana: **southamerica-east1** (São Paulo)
5. Clic en **"Listo"**

### 1.3 Crear usuario admin (Authentication)
1. Menú izquierdo → **"Authentication"**
2. Clic en **"Comenzar"**
3. Pestaña **"Sign-in method"** → habilitá **"Correo electrónico/Contraseña"**
4. Pestaña **"Users"** → clic en **"Agregar usuario"**
5. Poné tu email y una contraseña segura → **"Agregar usuario"**
   ⚠️ Guardá bien estas credenciales, las vas a usar para entrar al panel admin

### 1.4 Obtener las claves del proyecto
1. Menú izquierdo → ⚙️ **"Configuración del proyecto"** (rueda de configuración)
2. Bajá hasta **"Tus apps"** → clic en el ícono **`</>`** (Web)
3. Nombre de la app: `nexus-arena-web` → **"Registrar app"**
4. Te va a mostrar un bloque de código con `firebaseConfig`. Copiá esos valores.

### 1.5 Pegar las claves en tu proyecto
Abrí el archivo `js/firebase.js` y reemplazá los valores:

```javascript
const firebaseConfig = {
  apiKey:            "AIzaSy...",        // ← pegá tu apiKey
  authDomain:        "nexus-arena.firebaseapp.com",
  projectId:         "nexus-arena",
  storageBucket:     "nexus-arena.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
};
```

### 1.6 Reglas de seguridad de Firestore
1. En Firestore → pestaña **"Reglas"**
2. Reemplazá todo el contenido con esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Torneos: cualquiera puede leer, solo admin puede escribir
    match /torneos/{torneo} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    // Inscripciones: cualquiera puede crear, solo admin puede leer/modificar
    match /inscripciones/{inscripcion} {
      allow create: if true;
      allow read, update, delete: if request.auth != null;
    }
  }
}
```

3. Clic en **"Publicar"**

---

## PASO 2 — Configurar tu número de WhatsApp

Abrí `js/app.js` y buscá esta línea cerca del principio:

```javascript
const WA_NUMBER = "5491100000000"; // 🔴 Cambiá este número
```

Reemplazá `5491100000000` con tu número:
- `549` = código de Argentina
- `11` = código de área (sin el 0)
- Tu número sin el 15

Ejemplo: si tu número es 011-15-1234-5678 → ponés `5491112345678`

---

## PASO 3 — Subir a GitHub Pages

### 3.1 Crear repositorio en GitHub
1. Entrá a https://github.com
2. Clic en **"New repository"** (botón verde)
3. Nombre: `nexus-arena`
4. Dejalo en **Public**
5. **NO** marques "Add README"
6. Clic en **"Create repository"**

### 3.2 Subir el código desde VS Code
Abrí la terminal en VS Code (`Ctrl + Ñ` o `View → Terminal`) y ejecutá estos comandos uno por uno:

```bash
# Inicializar git en la carpeta del proyecto
git init

# Agregar todos los archivos
git add .

# Primer commit
git commit -m "Primer commit - NexusArena"

# Conectar con GitHub (reemplazá TU_USUARIO con tu usuario de GitHub)
git remote add origin https://github.com/TU_USUARIO/nexus-arena.git

# Subir el código
git branch -M main
git push -u origin main
```

### 3.3 Activar GitHub Pages
1. En tu repositorio de GitHub, clic en **"Settings"**
2. Menú izquierdo → **"Pages"**
3. En "Source" elegí **"Deploy from a branch"**
4. Branch: **main** / Folder: **/ (root)**
5. Clic en **"Save"**

⏱ Esperá 2-3 minutos. Tu página va a estar en:
**`https://TU_USUARIO.github.io/nexus-arena`**

---

## PASO 4 — Actualizar cambios (para el futuro)

Cada vez que modifiques algo, ejecutá en la terminal de VS Code:

```bash
git add .
git commit -m "Descripción del cambio"
git push
```

GitHub Pages se actualiza solo en 1-2 minutos.

---

## PASO 5 — Usar el panel admin

1. Entrá a `https://TU_USUARIO.github.io/nexus-arena/admin.html`
2. Poné el email y contraseña que creaste en Firebase (Paso 1.3)
3. Desde ahí podés:
   - **Crear torneos** con fecha, cupos, precio y formato
   - **Ver inscriptos** en tiempo real
   - **Confirmar pagos** (marcás como "confirmado" cuando la persona transfirió)
   - **Ver tu comisión** calculada automáticamente
   - **Cambiar estado** del torneo (abierto / próximo / lleno / finalizado)

---

## Estructura del proyecto

```
nexus-arena/
├── index.html        ← Página pública (la que ve la gente)
├── admin.html        ← Tu panel privado
├── css/
│   ├── styles.css    ← Estilos de la página pública
│   └── admin.css     ← Estilos del panel admin
├── js/
│   ├── firebase.js   ← Configuración Firebase (¡poné tus claves acá!)
│   ├── app.js        ← Lógica de la página pública
│   └── admin.js      ← Lógica del panel admin
└── README.md         ← Esta guía
```

---

## ¿Problemas? Cosas a revisar

| Problema | Solución |
|---|---|
| "Firebase not configured" | Revisá que pegaste bien las claves en `firebase.js` |
| No carga los torneos | Revisá las reglas de Firestore (Paso 1.6) |
| No puedo entrar al admin | Verificá el email/contraseña en Firebase > Authentication > Users |
| WhatsApp no abre | Verificá que el número en `app.js` tenga el formato correcto |
| GitHub Pages no actualiza | Esperá 3-5 minutos y hacé Ctrl+Shift+R en el navegador |

---

## Costo total: $0 💰

- Firebase Spark (gratis): hasta 50.000 lecturas/día — suficiente para tu escala
- GitHub Pages (gratis): hosting ilimitado para sitios estáticos
- Dominio propio (opcional): si en el futuro querés `nexusarena.com.ar` ≈ $2.000/año

---

¡Listo! Cualquier duda, modificá los archivos en VS Code, guardás, hacés `git add . && git commit -m "cambio" && git push` y en 2 minutos está live.
