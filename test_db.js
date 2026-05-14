const conexionBD = require('./config/db');

async function test() {
  try {
    const res = await conexionBD.query('SELECT * FROM users LIMIT 1');
    console.log("COLUMNS:", Object.keys(res.rows[0]));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

test();
