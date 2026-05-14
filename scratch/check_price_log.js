const conexionBD = require('./config/db');

async function checkPriceLogSchema() {
  try {
    const res = await conexionBD.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'price_logs'");
    console.log("PriceLog Columns:");
    res.rows.forEach(r => console.log(`${r.column_name}: ${r.data_type}`));
    
    const sample = await conexionBD.query("SELECT * FROM price_logs LIMIT 5");
    console.log("\nSample Data:");
    console.log(JSON.stringify(sample.rows, null, 2));
    
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

checkPriceLogSchema();
