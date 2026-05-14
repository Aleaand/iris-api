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
                SELECT 
                    r.booking_group_id,
                    MIN(r.id) as id,
                    MIN(r.status) as status,
                    MIN(r.payment_status) as payment_status,
                    SUM(r.total_price) as total_price,
                    MIN(r.created_at) as created_at,
                    MIN(f.flight_code) as flight_code,
                    MIN(f.departure_date) as departure_date,
                    MIN(f.arrival_date) as arrival_date,
                    MIN(d.name) as destination_name,
                    MIN(o.name) as origin_name,
                    MIN(s.name) as starship_name,
                    STRING_AGG(p.name || ' ' || p.primarylastname, ', ') as passenger_names,
                    COUNT(p.id) as passenger_count
                FROM reservations r
                LEFT JOIN flights f ON r.space_flight_id = f.id
                LEFT JOIN destinations d ON f.destination_id = d.id
                LEFT JOIN destinations o ON f.origin_id = o.id
                LEFT JOIN starships s ON f.starship_id = s.id
                LEFT JOIN passengers p ON r.passenger_id = p.id
                WHERE r.user_id = $1
                GROUP BY r.booking_group_id
                ORDER BY MIN(r.created_at) DESC
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
            // 1. Obtenemos la reserva base para saber el grupo
            const resBase = await conexionBD.query('SELECT booking_group_id FROM reservations WHERE id = $1 AND user_id = $2', [id, pedido.usuario.id]);
            if (resBase.rowCount === 0) return respuesta.status(404).json({ mensaje: 'Reserva no encontrada' });
            
            const groupId = resBase.rows[0].booking_group_id;

            // 2. Obtenemos todos los datos agregados del grupo
            const consulta = `
                SELECT 
                    r.*, 
                    f.flight_code, f.departure_date, f.arrival_date,
                    d.name as destination_name, 
                    o.name as origin_name,
                    s.name as starship_name,
                    u.name as user_name, u.email as user_email, u.phone as user_phone, u.primarylastname as user_lastname,
                    l.*,
                    h.name as hotel_name,
                    t.name as transfer_name
                FROM reservations r
                LEFT JOIN flights f ON r.space_flight_id = f.id
                LEFT JOIN destinations d ON f.destination_id = d.id
                LEFT JOIN destinations o ON f.origin_id = o.id
                LEFT JOIN starships s ON f.starship_id = s.id
                LEFT JOIN users u ON r.user_id = u.id
                LEFT JOIN reservation_logistics l ON r.id = l.reservation_id
                LEFT JOIN hotels h ON l.hotel_id = h.id
                LEFT JOIN transfers t ON l.transfer_id = t.id
                WHERE r.booking_group_id = $1 AND r.user_id = $2
                LIMIT 1
            `;
            const resultado = await conexionBD.query(consulta, [groupId, pedido.usuario.id]);
            
            // 3. Obtenemos la lista de todos los pasajeros del grupo
            const consultaPasajeros = `
                SELECT p.* 
                FROM reservations r
                JOIN passengers p ON r.passenger_id = p.id
                WHERE r.booking_group_id = $1
            `;
            const resultadoPasajeros = await conexionBD.query(consultaPasajeros, [groupId]);

            const reservaFinal = resultado.rows[0];
            reservaFinal.all_passengers = resultadoPasajeros.rows;
            reservaFinal.total_group_price = resultadoPasajeros.rowCount > 1 ? 
                (await conexionBD.query('SELECT SUM(total_price) FROM reservations WHERE booking_group_id = $1', [groupId])).rows[0].sum : 
                reservaFinal.total_price;

            respuesta.json(reservaFinal);
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener la reserva' });
        }
    },

    async createReservation(pedido, respuesta) {
        const { 
            vuelo_id, vuelo_regreso_id,
            cantidad_pasajeros,
            clase_asiento,
            precio_total,
            pasajeros,
            logistics 
        } = pedido.body;

        try {
            await conexionBD.query('BEGIN');
            
            // Generar un ID de grupo para todas las reservas de esta transacción
            const bookingGroupId = require('crypto').randomUUID();
            let lastReservaId;

            if (pasajeros && Array.isArray(pasajeros)) {
                for (const p of pasajeros) {
                    // 1. Registrar Pasajero (UPSERT: Si ya existe por DNI/País, lo actualizamos y obtenemos el ID)
                    const resPax = await conexionBD.query(`
                        INSERT INTO passengers (user_id, name, primarylastname, secondarylastname, document_number, document_country, birth_date, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                        ON CONFLICT (document_number, document_country) 
                        DO UPDATE SET updated_at = NOW(), name = EXCLUDED.name
                        RETURNING id
                    `, [pedido.usuario.id, p.nombre, p.apellido1, p.apellido2, p.dni, p.pais, p.fecha_nacimiento]);
                    const paxId = resPax.rows[0].id;

                    // 2. Crear Reserva (Siguiendo esquema Laravel)
                    // Nota: El precio se distribuye o se asigna por pasajero según la lógica de la web
                    const resRes = await conexionBD.query(`
                        INSERT INTO reservations (
                            user_id, passenger_id, space_flight_id, seat_type, total_price, 
                            status, id_locator, booking_group_id, payment_status, price_snapshot, created_at, updated_at
                        )
                        VALUES ($1, $2, $3, $4, $5, 'Pendiente', $6, $7, 'pending', $8, NOW(), NOW())
                        RETURNING id
                    `, [
                        pedido.usuario.id, 
                        paxId, 
                        vuelo_id, 
                        clase_asiento || 'none', 
                        (precio_total / pasajeros.length), 
                        require('crypto').randomUUID(),
                        bookingGroupId,
                        pedido.body.price_snapshot || null
                    ]);
                    lastReservaId = resRes.rows[0].id;

                    // 3. Logística Detallada (Ajustada a la tabla real)
                    if (logistics) {
                        await conexionBD.query(`
                            INSERT INTO reservation_logistics (
                                reservation_id, hotel_id, hotel_nights,
                                training_included, vip_transfer_included, refund_insurance_included, passport_management_included,
                                created_at, updated_at
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                        `, [
                            lastReservaId, 
                            logistics.hotel_id, 
                            logistics.hotel_nights || 0,
                            (p.training_mode === 'request'),
                            (logistics.vip_transfer || false),
                            (p.passport_mode === 'request'), // Usamos esto como flag de seguro/pasaporte según lógica previa
                            (p.passport_mode === 'request')
                        ]);
                    }
                }
            }

            await conexionBD.query('COMMIT');
            respuesta.status(201).json({ id: lastReservaId, mensaje: 'Misión sincronizada con el Centro de Control' });
        } catch (error) {
            await conexionBD.query('ROLLBACK');
            console.error('Error en Sincronización Iris:', error);
            respuesta.status(500).json({ 
                mensaje: 'Error al sincronizar misión con el sistema central',
                error: error.message,
                detalle: error.detail || 'No hay detalles adicionales'
            });
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
