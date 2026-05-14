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
                    STRING_AGG(DISTINCT p.name || ' ' || p.primarylastname, ', ') as passenger_names,
                    COUNT(DISTINCT p.id) as passenger_count,
                    (
                        SELECT json_agg(
                            json_build_object(
                                'flight_code', f.flight_code,
                                'departure_date', f.departure_date,
                                'arrival_date', f.arrival_date,
                                'destination_name', d.name,
                                'origin_name', o.name,
                                'starship_name', s.name
                            ) ORDER BY f.departure_date ASC
                        )
                        FROM (SELECT DISTINCT space_flight_id FROM reservations WHERE booking_group_id = r.booking_group_id) rf
                        JOIN flights f ON rf.space_flight_id = f.id
                        LEFT JOIN destinations d ON f.destination_id = d.id
                        LEFT JOIN destinations o ON f.origin_id = o.id
                        LEFT JOIN starships s ON f.starship_id = s.id
                    ) as flights
                FROM reservations r
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
            const resBase = await conexionBD.query('SELECT booking_group_id FROM reservations WHERE id = $1 AND user_id = $2', [id, pedido.usuario.id]);
            if (resBase.rowCount === 0) return respuesta.status(404).json({ mensaje: 'Reserva no encontrada' });

            const groupId = resBase.rows[0].booking_group_id;
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
            const resultadoVuelos = await conexionBD.query(consultaVuelos, [groupId]);
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
            const resultadoBase = await conexionBD.query(consultaBase, [groupId, pedido.usuario.id]);
            const consultaPasajeros = `
                SELECT p.* 
                FROM reservations r
                JOIN passengers p ON r.passenger_id = p.id
                WHERE r.booking_group_id = $1
                GROUP BY p.id
            `;
            const resultadoPasajeros = await conexionBD.query(consultaPasajeros, [groupId]);

            const reservaFinal = resultadoBase.rows[0];
            reservaFinal.all_passengers = resultadoPasajeros.rows;
            reservaFinal.outbound_flight = resultadoVuelos.rows[0];
            if (resultadoVuelos.rowCount > 1) {
                reservaFinal.return_flight = resultadoVuelos.rows[1];
            }

            reservaFinal.total_group_price = (await conexionBD.query('SELECT SUM(total_price) FROM reservations WHERE booking_group_id = $1', [groupId])).rows[0].sum;

            respuesta.json(reservaFinal);

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
            let firstReservaId = null;

            if (pasajeros && Array.isArray(pasajeros)) {
                for (const p of pasajeros) {
                    const resPax = await conexionBD.query(`
                        INSERT INTO passengers (user_id, name, primarylastname, secondarylastname, document_number, document_country, birth_date, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                        ON CONFLICT (document_number, document_country) 
                        DO UPDATE SET updated_at = NOW(), name = EXCLUDED.name
                        RETURNING id
                    `, [pedido.usuario.id, p.nombre, p.apellido1, p.apellido2, p.dni, p.pais, p.fecha_nacimiento]);
                    const paxId = resPax.rows[0].id;
                    const factorVuelos = vuelo_regreso_id ? 2 : 1;
                    const precioUnitario = (precio_total / (pasajeros.length * factorVuelos));
                    const resSalida = await conexionBD.query(`
                        INSERT INTO reservations (
                            user_id, passenger_id, space_flight_id, seat_type, total_price, 
                            status, id_locator, booking_group_id, payment_status, price_snapshot, created_at, updated_at
                        )
                        VALUES ($1, $2, $3, $4, $5, 'Pendiente', $6, $7, 'pending', $8, NOW(), NOW())
                        RETURNING id
                    `, [pedido.usuario.id, paxId, vuelo_id, clase_asiento || 'none', precioUnitario, require('crypto').randomUUID(), bookingGroupId, pedido.body.price_snapshot || null]);

                    const currentReservaId = resSalida.rows[0].id;
                    if (!firstReservaId) {
                        firstReservaId = currentReservaId;
                    }
                    if (vuelo_regreso_id) {
                        await conexionBD.query(`
                            INSERT INTO reservations (
                                user_id, passenger_id, space_flight_id, seat_type, total_price, 
                                status, id_locator, booking_group_id, payment_status, price_snapshot, created_at, updated_at
                            )
                            VALUES ($1, $2, $3, $4, $5, 'Pendiente', $6, $7, 'pending', $8, NOW(), NOW())
                        `, [pedido.usuario.id, paxId, vuelo_regreso_id, clase_asiento || 'none', precioUnitario, require('crypto').randomUUID(), bookingGroupId, null]);
                    }
                    if (logistics) {
                        await conexionBD.query(`
                            INSERT INTO reservation_logistics (
                                reservation_id, hotel_id, hotel_nights,
                                training_included, vip_transfer_included, refund_insurance_included, passport_management_included,
                                created_at, updated_at
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                        `, [
                            currentReservaId,
                            logistics.hotel_id,
                            logistics.hotel_nights || 0,
                            (p.training_mode === 'request'),
                            (logistics.vip_transfer || false),
                            (p.passport_mode === 'request'),
                            (p.passport_mode === 'request')
                        ]);
                    }
                }
            }

            await conexionBD.query('COMMIT');
            respuesta.status(201).json({ id: firstReservaId, mensaje: 'Misión sincronizada con el Centro de Control' });
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
        const campos = { ...pedido.body };
        for (let clave in campos) {
            if (campos[clave] === "") campos[clave] = null;
        }

        const {
            name, primarylastname, secondarylastname,
            document_number, document_country, birth_date,
            blood_type, allergies, physical_fitness,
            iris_passport_number, iris_passport_expiration,
            training_certificate_date, training_certificate_status,
            passport_photo, passport_status, passport_pdf
        } = campos;
        if (!name || !primarylastname || !document_number || !document_country || !birth_date) {
            return respuesta.status(400).json({ mensaje: 'Nombre, primer apellido, documento, país y fecha de nacimiento son obligatorios.' });
        }

        try {
            const consulta = `
                INSERT INTO passengers (
                    user_id, name, primarylastname, secondarylastname, 
                    document_number, document_country, birth_date,
                    blood_type, allergies, physical_fitness,
                    iris_passport_number, iris_passport_expiration,
                    training_certificate_date, training_certificate_status,
                    passport_photo, passport_status, passport_pdf,
                    created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
                RETURNING *
            `;
            const resultado = await conexionBD.query(consulta, [
                pedido.usuario.id, name, primarylastname, secondarylastname || '',
                document_number, document_country, birth_date,
                blood_type || '', allergies || '', physical_fitness || 'No apto',
                iris_passport_number || '', iris_passport_expiration || null,
                training_certificate_date || null, training_certificate_status || 'Pendiente',
                passport_photo || '', passport_status || 'none', passport_pdf || ''
            ]);
            respuesta.status(201).json(resultado.rows[0]);
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al registrar pasajero' });
        }
    },

    async updatePassenger(pedido, respuesta) {
        const { id } = pedido.params;
        const campos = { ...pedido.body };
        for (let clave in campos) {
            if (campos[clave] === "") campos[clave] = null;
        }

        const {
            name, primarylastname, secondarylastname,
            document_number, document_country, birth_date,
            blood_type, allergies, physical_fitness,
            iris_passport_number, iris_passport_expiration,
            training_certificate_date, training_certificate_status,
            passport_photo, passport_status, passport_pdf
        } = campos;

        try {
            const consulta = `
                UPDATE passengers 
                SET name = COALESCE($1, name), 
                    primarylastname = COALESCE($2, primarylastname), 
                    secondarylastname = COALESCE($3, secondarylastname), 
                    document_number = COALESCE($4, document_number), 
                    document_country = COALESCE($5, document_country), 
                    birth_date = COALESCE($6, birth_date),
                    blood_type = COALESCE($7, blood_type),
                    allergies = COALESCE($8, allergies),
                    physical_fitness = COALESCE($9, physical_fitness),
                    iris_passport_number = COALESCE($10, iris_passport_number),
                    iris_passport_expiration = COALESCE($11, iris_passport_expiration),
                    training_certificate_date = COALESCE($12, training_certificate_date),
                    training_certificate_status = COALESCE($13, training_certificate_status),
                    passport_photo = COALESCE($14, passport_photo),
                    passport_status = COALESCE($15, passport_status),
                    passport_pdf = COALESCE($16, passport_pdf),
                    updated_at = NOW()
                WHERE id = $17 AND user_id = $18
                RETURNING *
            `;
            const resultado = await conexionBD.query(consulta, [
                name, primarylastname, secondarylastname,
                document_number, document_country, birth_date,
                blood_type, allergies, physical_fitness,
                iris_passport_number, iris_passport_expiration,
                training_certificate_date, training_certificate_status,
                passport_photo, passport_status, passport_pdf,
                id, pedido.usuario.id
            ]);
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
            const checkReserva = await conexionBD.query('SELECT id FROM reservations WHERE passenger_id = $1 LIMIT 1', [id]);
            if (checkReserva.rowCount > 0) {
                return respuesta.status(403).json({
                    mensaje: 'No se puede eliminar el pasajero porque tiene reservas asociadas.'
                });
            }

            const consulta = 'DELETE FROM passengers WHERE id = $1 AND user_id = $2 RETURNING id';
            const resultado = await conexionBD.query(consulta, [id, pedido.usuario.id]);
            if (resultado.rowCount === 0) return respuesta.status(404).json({ mensaje: 'Pasajero no encontrado' });
            respuesta.json({ mensaje: 'Pasajero eliminado con éxito', id: resultado.rows[0].id });
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

    async getManagerProfile(pedido, respuesta) {
        try {
            const resUser = await conexionBD.query('SELECT assigned_manager_id FROM users WHERE id = $1', [pedido.usuario.id]);
            if (resUser.rowCount === 0) {
                console.log("[IRIS API] Usuario no encontrado:", pedido.usuario.id);
                return respuesta.status(404).json({ mensaje: 'Usuario no encontrado' });
            }
            
            let gestorId = resUser.rows[0].assigned_manager_id;
            console.log("[IRIS API] ID de gestor actual:", gestorId);

            if (!gestorId) {
                const resGestores = await conexionBD.query("SELECT id FROM users WHERE role IN ('gestor', 'admin') ORDER BY RANDOM() LIMIT 1");
                if (resGestores.rowCount > 0) {
                    gestorId = resGestores.rows[0].id;
                    await conexionBD.query('UPDATE users SET assigned_manager_id = $1 WHERE id = $2', [gestorId, pedido.usuario.id]);
                } else {
                    gestorId = 1;
                }
            }
            const resManager = await conexionBD.query('SELECT id, name, email, phone, avatar FROM users WHERE id = $1', [gestorId]);
            
            if (resManager.rowCount > 0) {
                console.log("[IRIS API] Perfil de gestor encontrado:", resManager.rows[0].name);
                respuesta.json(resManager.rows[0]);
            } else {
                console.log("[IRIS API] Gestor ID no existe en la BD, enviando datos genéricos");
                respuesta.json({ 
                    id: gestorId, 
                    name: "ERROR", 
                    email: "error@iris.aero", 
                    phone: "600000000", 
                    avatar: null 
                });
            }
        } catch (error) {
            respuesta.status(500).json({ mensaje: 'Error interno al obtener gestor' });
        }
    },

    async getMessages(pedido, respuesta) {
        try {
            const consulta = `
                SELECT *, 
                CASE WHEN type = 'nota_cliente' THEN 'user' ELSE 'manager' END as sender_type 
                FROM contact_logs 
                WHERE client_id = $1 
                ORDER BY created_at ASC
            `;
            const resultado = await conexionBD.query(consulta, [pedido.usuario.id]);
            respuesta.json({ total: resultado.rowCount, datos: resultado.rows });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener mensajes' });
        }
    },

    async sendMessage(pedido, respuesta) {
        const { mensaje, contenido } = pedido.body;
        const textoFinal = mensaje || contenido || "";

        try {
            const resUser = await conexionBD.query('SELECT assigned_manager_id, name FROM users WHERE id = $1', [pedido.usuario.id]);
            let gestorId = resUser.rows[0].assigned_manager_id;
            const userName = resUser.rows[0].name;

            if (!gestorId) {
                const resGestores = await conexionBD.query("SELECT id FROM users WHERE role IN ('gestor', 'admin') ORDER BY RANDOM() LIMIT 1");
                gestorId = resGestores.rowCount > 0 ? resGestores.rows[0].id : 1;
                await conexionBD.query('UPDATE users SET assigned_manager_id = $1 WHERE id = $2', [gestorId, pedido.usuario.id]);
            }

            // 1. Guardar en logs (con tipo nota_cliente para identificarlo en el chat)
            const consultaLog = `
                INSERT INTO contact_logs (client_id, gestor_id, type, notes, created_at, updated_at)
                VALUES ($1, $2, 'nota_cliente', $3, NOW(), NOW())
                RETURNING *, 'user' as sender_type
            `;
            const resLog = await conexionBD.query(consultaLog, [pedido.usuario.id, gestorId, textoFinal]);
            const consultaTarea = `
                INSERT INTO tasks (assigned_gestor_id, created_by, title, description, type, status, priority, created_at, updated_at)
                VALUES ($1, $2, $3, $4, 'consulta_cliente', 'Pendiente', 'media', NOW(), NOW())
            `;
            await conexionBD.query(consultaTarea, [
                gestorId,
                pedido.usuario.id,
                `El cliente ${userName} ha enviado un mensaje: "${textoFinal.substring(0, 50)}..."`
            ]);

            respuesta.status(201).json({ mensaje: resLog.rows[0] });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al enviar mensaje' });
        }
    },

    async getPayments(pedido, respuesta) {
        try {
            const consulta = `
                SELECT 
                    id as reservation_id, 
                    total_price as amount, 
                    payment_status,
                    paid_at,
                    updated_at,
                    stripe_receipt_url,
                    stripe_session_id,
                    stripe_receipts
                FROM reservations 
                WHERE user_id = $1 AND (payment_status = 'paid' OR payment_status = 'refunded')
                ORDER BY COALESCE(paid_at, updated_at) DESC
            `;
            const resultado = await conexionBD.query(consulta, [pedido.usuario.id]);
            let pagosExpandidos = [];
            resultado.rows.forEach(res => {
                const receipts = res.stripe_receipts || [];
                if (receipts.length > 0) {
                    receipts.forEach((r, index) => {
                        pagosExpandidos.push({
                            id: `${res.reservation_id}_${index}`,
                            reservation_id: res.reservation_id,
                            amount: parseFloat(r.amount),
                            status: r.type === 'refund' ? 'Reembolsado' : 'Pagado',
                            created_at: r.date,
                            invoice_url: r.url,
                            stripe_payment_id: res.stripe_session_id,
                            description: r.description || `Misión Iris #${res.reservation_id}`
                        });
                    });
                } else {
                    pagosExpandidos.push({
                        id: res.reservation_id,
                        reservation_id: res.reservation_id,
                        amount: parseFloat(res.amount),
                        status: res.payment_status === 'paid' ? 'Pagado' : 'Reembolsado',
                        created_at: res.paid_at || res.updated_at,
                        invoice_url: res.stripe_receipt_url,
                        stripe_payment_id: res.stripe_session_id,
                        description: `Reserva #${res.reservation_id}`
                    });
                }
            });

            respuesta.json({ total: pagosExpandidos.length, datos: pagosExpandidos });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener pagos' });
        }
    },

    async createTask(pedido, respuesta) {
        const { title, description, type, priority } = pedido.body;
        try {
            const resUser = await conexionBD.query('SELECT assigned_manager_id FROM users WHERE id = $1', [pedido.usuario.id]);
            const gestorId = resUser.rows[0].assigned_manager_id || 1;

            const consulta = `
                INSERT INTO tasks (assigned_gestor_id, created_by, title, description, type, status, priority, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, 'Pendiente', $6, NOW(), NOW())
                RETURNING *
            `;
            const resultado = await conexionBD.query(consulta, [
                gestorId,
                pedido.usuario.id,
                title,
                description,
                type || 'general',
                priority || 'media'
            ]);
            respuesta.status(201).json(resultado.rows[0]);
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al crear la tarea' });
        }
    }
};

module.exports = customerController;
