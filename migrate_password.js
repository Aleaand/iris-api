const conexionBD = require('./config/db');

async function migrate() {
    try {
        console.log("Iniciando migración para recuperación de contraseña...");
        await conexionBD.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255), 
            ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP;
        `);
        console.log("Columnas añadidas con éxito.");
        process.exit(0);
    } catch (error) {
        console.error("Error en la migración:", error);
        process.exit(1);
    }
}

migrate();
