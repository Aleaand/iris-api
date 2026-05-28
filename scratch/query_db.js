const conexionBD = require('../config/db');

async function main() {
  try {
    const res = await poolQuery(`
      SELECT r.id, r.user_id, r.space_flight_id, r.booking_group_id, r.payment_status, f.flight_code
      FROM reservations r
      LEFT JOIN flights f ON r.space_flight_id = f.id
      WHERE r.id = '81'
    `);
    console.log("Reservations:");
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await conexionBD.end();
  }
}

function poolQuery(text, params) {
  return conexionBD.query(text, params);
}

main();
