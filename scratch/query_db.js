const conexionBD = require('../config/db');

async function main() {
  const id = 80;
  const userId = 16;
  try {
    const resBase = await poolQuery('SELECT booking_group_id FROM reservations WHERE id = $1 AND user_id = $2', [id, userId]);
    console.log("resBase:", resBase.rows);
    if (resBase.rowCount === 0) {
      console.log("Reserva no encontrada");
      return;
    }

    const groupId = resBase.rows[0].booking_group_id;
    console.log("groupId:", groupId);

    const consultaVuelos = `
        SELECT DISTINCT
            f.flight_code, f.departure_date, f.arrival_date,
            d.name as destination_name, 
            o.name as origin_name,
            s.name as starship_name,
            r.space_flight_id
        FROM reservations r
        JOIN flights f ON r.space_flight_id = f.id
        LEFT JOIN destinations d ON f.destination_id = d.id
        LEFT JOIN destinations o ON f.origin_id = o.id
        LEFT JOIN starships s ON f.starship_id = s.id
        WHERE r.booking_group_id = $1
        ORDER BY f.departure_date ASC
    `;
    const resultadoVuelos = await poolQuery(consultaVuelos, [groupId]);
    console.log("resultadoVuelos:", resultadoVuelos.rows);

    const consultaBase = `
        SELECT 
            r.*, 
            u.name as user_name, u.email as user_email, u.phone as user_phone, u.primarylastname as user_lastname,
            l.*,
            h.name as hotel_name,
            tf.airline as transfer_name
        FROM reservations r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN reservation_logistics l ON r.id = l.reservation_id
        LEFT JOIN hotels h ON l.hotel_id = h.id
        LEFT JOIN terrestrial_flights tf ON l.terrestrial_flight_id = tf.id
        WHERE r.booking_group_id = $1 AND r.user_id = $2
        ORDER BY r.id ASC
        LIMIT 1
    `;
    const resultadoBase = await poolQuery(consultaBase, [groupId, userId]);
    console.log("resultadoBase:", resultadoBase.rows);

    const consultaPasajeros = `
        SELECT p.* 
        FROM reservations r
        JOIN passengers p ON r.passenger_id = p.id
        WHERE r.booking_group_id = $1
        GROUP BY p.id
    `;
    const resultadoPasajeros = await poolQuery(consultaPasajeros, [groupId]);
    console.log("resultadoPasajeros:", resultadoPasajeros.rows);

    const reservaFinal = resultadoBase.rows[0];
    reservaFinal.all_passengers = resultadoPasajeros.rows;
    reservaFinal.outbound_flight = resultadoVuelos.rows[0];
    if (resultadoVuelos.rowCount > 1) {
        reservaFinal.return_flight = resultadoVuelos.rows[1];
    }
    console.log("reservaFinal:", reservaFinal);
  } catch (err) {
    console.error("ERROR IN CONTROLLER LOGIC:", err);
  } finally {
    await conexionBD.end();
  }
}

function poolQuery(text, params) {
  return conexionBD.query(text, params);
}

main();
