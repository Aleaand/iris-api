const conexionBD = require('./config/db');

async function checkReservationsSchema() {
  try {
    const res = await conexionBD.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'reservations'");
    console.log("Reservations Columns:");
    res.rows.forEach(r => console.log(`${r.column_name}: ${r.data_type}`));
    
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

checkReservationsSchema();
