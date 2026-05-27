const express = require('express');
const cors = require('cors');
require('dotenv').config();

const servidor = express();
const puerto = process.env.PORT || 3000;

// Validación de variables de entorno recomendadas
const variablesCriticas = ['DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD', 'JWT_SECRET', 'STRIPE_SECRET'];
const faltantes = variablesCriticas.filter(v => !process.env[v]);
if (faltantes.length > 0) {
  console.warn(`\x1b[33m⚠️ ADVERTENCIA: Faltan variables de entorno esenciales: ${faltantes.join(', ')}\x1b[0m`);
  console.warn(`\x1b[33mAsegúrate de tener un archivo .env configurado correctamente en local.\x1b[0m`);
}

servidor.use(cors());
const rutasPublicas = require('./routes/publicRoutes');
const rutasAuth = require('./routes/authRoutes');
const rutasCliente = require('./routes/customerRoutes');
const rutasPagos = require('./routes/paymentRoutes');
const rutasInfo = require('./routes/infoRoutes');

servidor.use((pedido, respuesta, siguiente) => {
  if (pedido.originalUrl.includes('/payments/webhook')) {
    siguiente();
  } else {
    express.json()(pedido, respuesta, siguiente);
  }
});

servidor.use('/api/v1', rutasPublicas);
servidor.use('/api/v1/auth', rutasAuth);
servidor.use('/api/v1/me', rutasCliente);
servidor.use('/api/v1/payments', rutasPagos);
servidor.use('/api/v1', rutasInfo);

servidor.get('/api/v1/prueba', (pedido, respuesta) => {
  respuesta.json({
    mensaje: 'API de Iris Aerospace OK',
    estado: 'Operativo',
    fecha_servidor: new Date()
  });
});

servidor.listen(puerto, () => {
  console.log('API de Iris Aerospace desplegado');
  console.log(`- Puerto: ${puerto}`);
  console.log(`- Prueba: http://localhost:${puerto}/api/v1/prueba`);
});
