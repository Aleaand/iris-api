const { Pool } = require('pg');
require('dotenv').config();

const conexionBD = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

conexionBD.query('SELECT NOW()', (error, resultado) => {
  if (error) {
    console.error('Error al conectar con NeonTech', error.stack);
  } else {
    console.log('Conexión con base de datos NeonTech establecida con éxito.');
  }
});

module.exports = conexionBD;
