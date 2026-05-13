const conexionBD = require('../config/db');

const customerController = {
    
    async getMe(pedido, respuesta) {
        try {
            const consulta = 'SELECT id, name, email, primarylastname, secondarylastname, phone, birth_date, role FROM users WHERE id = $1';
            const resultado = await conexionBD.query(consulta, [pedido.usuario.id]);
            if (resultado.rowCount === 0) return respuesta.status(404).json({ mensaje: 'Usuario no encontrado' });
            respuesta.json(resultado.rows[0]);
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener perfil' });
        }
    },

    async updateMe(pedido, respuesta) {
        const nombre = pedido.body.nombre || pedido.body.name;
        const apellido1 = pedido.body.apellido1 || pedido.body.primarylastname;
        const apellido2 = pedido.body.apellido2 || pedido.body.secondarylastname;
        const telefono = pedido.body.telefono || pedido.body.phone;
        const fecha_nacimiento = pedido.body.fecha_nacimiento || pedido.body.birth_date;
        try {
            const consulta = `
                UPDATE users 
                SET name = COALESCE($1, name), 
                    primarylastname = COALESCE($2, primarylastname), 
                    secondarylastname = COALESCE($3, secondarylastname), 
                    phone = COALESCE($4, phone), 
                    birth_date = COALESCE($5, birth_date),
                    updated_at = NOW()
                WHERE id = $6
                RETURNING id, name, email, primarylastname, secondarylastname, phone, birth_date
            `;
            const resultado = await conexionBD.query(consulta, [nombre, apellido1, apellido2, telefono, fecha_nacimiento, pedido.usuario.id]);
            respuesta.json(resultado.rows[0]);
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al actualizar perfil' });
        }
    },

    async getReservations(pedido, respuesta) {
        try {
            const consulta = `
                SELECT r.*, f.flight_code, f.departure_date, d.name as destination_name
                FROM reservations r
                LEFT JOIN flights f ON r.space_flight_id = f.id
                LEFT JOIN destinations d ON f.destination_id = d.id
                WHERE r.user_id = $1
                ORDER BY r.created_at DESC
            `;
            const resultado = await conexionBD.query(consulta, [pedido.usuario.id]);
            respuesta.json({ total: resultado.rowCount, datos: resultado.rows });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener reservas' });
        }
    },

    async getReservationById(pedido, respuesta) {
        const { id } = pedido.params;
        try {
            const consulta = `
                SELECT r.*, f.flight_code, f.departure_date, d.name as destination_name, 
                       l.hotel_id, l.training_included, l.refund_insurance_included
                FROM reservations r
                LEFT JOIN flights f ON r.space_flight_id = f.id
                LEFT JOIN destinations d ON f.destination_id = d.id
                LEFT JOIN reservation_logistics l ON r.id = l.reservation_id
                WHERE r.id = $1 AND r.user_id = $2
            `;
            const resultado = await conexionBD.query(consulta, [id, pedido.usuario.id]);
            if (resultado.rowCount === 0) return respuesta.status(404).json({ mensaje: 'Reserva no encontrada' });
            respuesta.json(resultado.rows[0]);
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener la reserva' });
        }
    },

    async createReservation(pedido, respuesta) {
        const { 
            space_flight_id, vuelo_id,
            passenger_id, 
            seat_type, clase_asiento,
            total_price, precio_total,
            pasajeros, passengers,
            logistics 
        } = pedido.body;

        const flightId = vuelo_id || space_flight_id;
        const seatType = clase_asiento || seat_type;
        const totalPrice = precio_total || total_price;
        const tripulantes = pasajeros || passengers;

        try {
            await conexionBD.query('BEGIN');
            
            let lastReservaId;

            if (tripulantes && Array.isArray(tripulantes)) {
                for (const p of tripulantes) {
                    const nombre = p.nombre || p.name;
                    const apellido1 = p.apellido1 || p.primarylastname;
                    const apellido2 = p.apellido2 || p.secondarylastname || "";
                    const dni = p.dni || p.document_number;
                    const pais = p.pais || p.document_country || "ESP";
                    const fecha_nacimiento = p.fecha_nacimiento || p.birth_date;

                    const resPax = await conexionBD.query(`
                        INSERT INTO passengers (user_id, name, primarylastname, secondarylastname, document_number, document_country, birth_date, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                        RETURNING id
                    `, [pedido.usuario.id, nombre, apellido1, apellido2, dni, pais, fecha_nacimiento]);
                    const paxId = resPax.rows[0].id;
                    const resRes = await conexionBD.query(`
                        INSERT INTO reservations (user_id, passenger_id, space_flight_id, seat_type, total_price, status, id_locator, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, $5, 'Pendiente', UPPER(LEFT(gen_random_uuid()::text, 8)), NOW(), NOW())
                        RETURNING id
                    `, [pedido.usuario.id, paxId, flightId, seatType, (totalPrice / tripulantes.length)]);
                    lastReservaId = resRes.rows[0].id;

                    if (logistics) {
                        await conexionBD.query(`
                            INSERT INTO reservation_logistics (reservation_id, hotel_id, hotel_nights, training_included, refund_insurance_included, created_at, updated_at)
                            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                        `, [lastReservaId, logistics.hotel_id, logistics.hotel_nights || 0, (p.training_mode === 'request'), (p.passport_mode === 'request')]);
                    }
                }
            } else {
                const resRes = await conexionBD.query(`
                    INSERT INTO reservations (user_id, passenger_id, space_flight_id, seat_type, total_price, status, id_locator, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, 'Pendiente', UPPER(LEFT(gen_random_uuid()::text, 8)), NOW(), NOW())
                    RETURNING id
                `, [pedido.usuario.id, passenger_id, flightId, seatType, totalPrice]);
                lastReservaId = resRes.rows[0].id;

                if (logistics) {
                    await conexionBD.query(`
                        INSERT INTO reservation_logistics (reservation_id, hotel_id, hotel_nights, training_included, refund_insurance_included, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                    `, [lastReservaId, logistics.hotel_id, logistics.hotel_nights || 0, logistics.training_included || false, logistics.refund_insurance_included || false]);
                }
            }

            await conexionBD.query('COMMIT');
            respuesta.status(201).json({ id: lastReservaId, mensaje: 'Misión registrada con éxito' });
        } catch (error) {
            await conexionBD.query('ROLLBACK');
            console.error('Error en createReservation:', error);
            respuesta.status(500).json({ mensaje: 'Error al registrar la misión en el sistema central' });
        }
    },

    async cancelReservation(pedido, respuesta) {
        const { id } = pedido.params;
        try {
            const consulta = 'UPDATE reservations SET status = \'Cancelada\', updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *';
            const resultado = await conexionBD.query(consulta, [id, pedido.usuario.id]);
            if (resultado.rowCount === 0) return respuesta.status(404).json({ mensaje: 'Reserva no encontrada' });
            respuesta.json({ mensaje: 'Solicitud de cancelación procesada', reserva: resultado.rows[0] });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al cancelar la reserva' });
        }
    },

    async getPassengers(pedido, respuesta) {
        try {
            const consulta = 'SELECT * FROM passengers WHERE user_id = $1 ORDER BY name ASC';
            const resultado = await conexionBD.query(consulta, [pedido.usuario.id]);
            respuesta.json({ total: resultado.rowCount, datos: resultado.rows });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener pasajeros' });
        }
    },

    async createPassenger(pedido, respuesta) {
        // Soporte para nombres de campos tanto en español como en inglés
        const nombre = pedido.body.nombre || pedido.body.name;
        const apellido1 = pedido.body.apellido1 || pedido.body.primarylastname;
        const apellido2 = pedido.body.apellido2 || pedido.body.secondarylastname || "";
        const dni = pedido.body.dni || pedido.body.document_number;
        const pais = pedido.body.pais || pedido.body.document_country || "ESP";
        const fecha_nacimiento = pedido.body.fecha_nacimiento || pedido.body.birth_date;

        try {
            const consulta = `
                INSERT INTO passengers (user_id, name, primarylastname, secondarylastname, document_number, document_country, birth_date, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                RETURNING *
            `;
            const resultado = await conexionBD.query(consulta, [pedido.usuario.id, nombre, apellido1, apellido2, dni, pais, fecha_nacimiento]);
            respuesta.status(201).json(resultado.rows[0]);
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al registrar pasajero' });
        }
    },

    async updatePassenger(pedido, respuesta) {
        const { id } = pedido.params;
        const nombre = pedido.body.nombre || pedido.body.name;
        const apellido1 = pedido.body.apellido1 || pedido.body.primarylastname;
        const apellido2 = pedido.body.apellido2 || pedido.body.secondarylastname;
        const dni = pedido.body.dni || pedido.body.document_number;
        const pais = pedido.body.pais || pedido.body.document_country;
        const fecha_nacimiento = pedido.body.fecha_nacimiento || pedido.body.birth_date;
        
        try {
            const consulta = `
                UPDATE passengers 
                SET name = COALESCE($1, name), 
                    primarylastname = COALESCE($2, primarylastname), 
                    secondarylastname = COALESCE($3, secondarylastname), 
                    document_number = COALESCE($4, document_number), 
                    document_country = COALESCE($5, document_country), 
                    birth_date = COALESCE($6, birth_date),
                    updated_at = NOW()
                WHERE id = $7 AND user_id = $8
                RETURNING *
            `;
            const resultado = await conexionBD.query(consulta, [nombre, apellido1, apellido2, dni, pais, fecha_nacimiento, id, pedido.usuario.id]);
            if (resultado.rowCount === 0) return respuesta.status(404).json({ mensaje: 'Pasajero no encontrado' });
            respuesta.json(resultado.rows[0]);
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al actualizar pasajero' });
        }
    },

    async deletePassenger(pedido, respuesta) {
        const { id } = pedido.params;
        try {
            const consulta = 'DELETE FROM passengers WHERE id = $1 AND user_id = $2 RETURNING id';
            const resultado = await conexionBD.query(consulta, [id, pedido.usuario.id]);
            if (resultado.rowCount === 0) return respuesta.status(404).json({ mensaje: 'Pasajero no encontrado' });
            respuesta.json({ mensaje: 'Pasajero eliminado', id: resultado.rows[0].id });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al eliminar pasajero' });
        }
    },

    async getDocuments(pedido, respuesta) {
        try {
            const consulta = 'SELECT id, name, document_number, passport_status, iris_passport_number FROM passengers WHERE user_id = $1';
            const resultado = await conexionBD.query(consulta, [pedido.usuario.id]);
            respuesta.json({ total: resultado.rowCount, datos: resultado.rows });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener documentos' });
        }
    },

    async getPassport(pedido, respuesta) {
        const { passengerId } = pedido.params;
        try {
            const consulta = 'SELECT passport_pdf FROM passengers WHERE id = $1 AND user_id = $2';
            const resultado = await conexionBD.query(consulta, [passengerId, pedido.usuario.id]);
            if (resultado.rowCount === 0 || !resultado.rows[0].passport_pdf) {
                return respuesta.status(404).json({ mensaje: 'Pasaporte no disponible' });
            }
            respuesta.json({ url: resultado.rows[0].passport_pdf });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener el pasaporte' });
        }
    },

    async getMessages(pedido, respuesta) {
        try {
            const consulta = 'SELECT * FROM contact_logs WHERE client_id = $1 ORDER BY created_at DESC';
            const resultado = await conexionBD.query(consulta, [pedido.usuario.id]);
            respuesta.json({ total: resultado.rowCount, datos: resultado.rows });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener mensajes' });
        }
    },

    async sendMessage(pedido, respuesta) {
        const { mensaje } = pedido.body;
        try {
            // Buscamos el gestor asignado al cliente
            const resUser = await conexionBD.query('SELECT assigned_manager_id FROM users WHERE id = $1', [pedido.usuario.id]);
            const gestorId = resUser.rows[0].assigned_manager_id || 1; // Fallback al gestor 1 si no hay asignado

            const consulta = `
                INSERT INTO contact_logs (client_id, gestor_id, type, notes, created_at, updated_at)
                VALUES ($1, $2, 'nota', $3, NOW(), NOW())
                RETURNING *
            `;
            const resultado = await conexionBD.query(consulta, [pedido.usuario.id, gestorId, mensaje]);
            respuesta.status(201).json(resultado.rows[0]);
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al enviar mensaje' });
        }
    },

    async getPayments(pedido, respuesta) {
        try {
            const consulta = 'SELECT id, total_price, status, payment_status, paid_at, stripe_receipt_url FROM reservations WHERE user_id = $1 AND payment_status = \'paid\' ORDER BY paid_at DESC';
            const resultado = await conexionBD.query(consulta, [pedido.usuario.id]);
            respuesta.json({ total: resultado.rowCount, datos: resultado.rows });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener pagos' });
        }
    }
};

module.exports = customerController;
