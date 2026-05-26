# Iris Aerospace - API Bridge

Repositorio correspondiente al **API Bridge** (backend intermedio) del ecosistema de Iris Aerospace.

## Descripción del Proyecto

`iris-api` actúa como la capa de enlace y seguridad entre la interfaz pública del cliente (`iris-web`) y la base de datos central (PostgreSQL en NeonTech). 

Su propósito principal es conectarse directamente a la base de datos PostgreSQL, consultar la información necesaria y devolver los datos limpios y preprocesados al frontend (`iris-web`). Sus responsabilidades clave incluyen:
- Autenticación y validación criptográfica de tokens JWT.
- Generación de *Snapshots* financieros inmutables durante el proceso de reserva.
- Consulta optimizada del catálogo de planetas, naves y vuelos.
- Comunicación con la API de Stripe para la creación de *PaymentIntents*.

## Stack Tecnológico

La API está desarrollada bajo un entorno no bloqueante y de alta concurrencia:

- **Entorno:** [Node.js](https://nodejs.org/)
- **Framework Web:** [Express.js](https://expressjs.com/)
- **Base de Datos:** [PostgreSQL](https://www.postgresql.org/) (usando el cliente `pg` para consultas directas).
- **Autenticación y Seguridad:** `jsonwebtoken` (JWT) y `bcryptjs` para el cifrado de contraseñas.
- **Transacciones:** [Stripe API](https://stripe.com/docs/api) integrada para procesar pagos de forma segura.

## Estructura del Directorio

```text
iris-api/
├── config/               # Archivos de configuración (Conexión a la base de datos PostgreSQL)
├── controllers/          # Lógica de negocio (Autenticación, Reservas, Vuelos, Destinos)
├── middleware/           # Validadores y protección de rutas (Verificación de JWT)
├── routes/               # Definición de los endpoints de la API (Rutas REST)
├── server.js             # Archivo principal de entrada y configuración del servidor Express
└── package.json          # Dependencias y scripts de ejecución
```

## Instalación y Configuración

### 1. Clonar el repositorio y acceder a la carpeta
```bash
git clone <url-del-repo>
cd iris-api
```

### 2. Instalar las dependencias
Asegúrate de tener Node.js instalado en tu sistema.
```bash
npm install
```

### 3. Variables de Entorno
Crea un archivo `.env` en la raíz del proyecto tomando como referencia las variables necesarias para conectar con NeonTech y Stripe:

```env
# Ejemplo de .env
PORT=5000
DB_USER=usuario_neon
DB_HOST=ep-nombre-servidor.neon.tech
DB_NAME=iris_db
DB_PASSWORD=tu_contraseña
DB_PORT=5432

JWT_SECRET=tu_clave_secreta
STRIPE_SECRET_KEY=sk_test_...
```

### 4. Ejecutar el servidor
Para un entorno de desarrollo (con recarga automática mediante `nodemon`):
```bash
npm run dev
```
Para ejecutar en producción:
```bash
npm start
```

El servidor iniciará (por defecto) en `http://localhost:5000`.

## Despliegue en Producción

Esta API está completamente configurada para entornos de producción y se encuentra actualmente **desplegada y operando en [Render](https://render.com/)**. Render facilita el auto-despliegue conectándose directamente al repositorio, proveyendo un certificado SSL (HTTPS) automático indispensable para que `iris-web` pueda comunicarse con la base de datos de manera segura y sin bloqueos de CORS o de contenido mixto.

## Enlaces Relacionados (Ecosistema Iris)

Este proyecto funciona como un conector ("Bridge") dentro del ecosistema Iris Aerospace y trabaja conjuntamente con:
1. **Frontend Público (`iris-web`)**: Aplicación Next.js que consume esta API para mostrar el catálogo y enviar las reservas de los clientes.
2. **ERP Interno (`control-iris`)**: Sistema monolítico en Laravel que comparte la misma base de datos para realizar la gestión administrativa, auditorías y reembolsos.

## Licencia / Autoría
Desarrollado por Alejandra para su proyecto de final. Todos los derechos reservados al contexto académico del proyecto.
