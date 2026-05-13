const stripe = require('stripe')(process.env.STRIPE_SECRET);
const conexionBD = require('../config/db');

const paymentController = {

    async createIntent(pedido, respuesta) {
        const { reserva_id } = pedido.body;

        try {
            const consultaReserva = 'SELECT total_price FROM reservations WHERE id = $1 AND user_id = $2';
            const resultadoReserva = await conexionBD.query(consultaReserva, [reserva_id, pedido.usuario.id]);

            if (resultadoReserva.rowCount === 0) {
                return respuesta.status(404).json({ mensaje: 'Reserva no encontrada' });
            }

            const monto = Math.round(parseFloat(resultadoReserva.rows[0].total_price) * 100);

            const intent = await stripe.paymentIntents.create({
                amount: monto,
                currency: 'eur',
                metadata: {
                    reserva_id: reserva_id,
                    usuario_id: pedido.usuario.id
                }
            });

            respuesta.json({
                clientSecret: intent.client_secret,
                mensaje: 'Intento de pago creado con éxito'
            });

        } catch (error) {
            console.error('Error en Stripe:', error);
            respuesta.status(500).json({ mensaje: 'Error al procesar el pago con Stripe' });
        }
    },

    async handleWebhook(pedido, respuesta) {
        console.log('--- Webhook de Stripe Recibido ---');
        try {
            const payload = pedido.body.toString();
            const evento = JSON.parse(payload);
            console.log(`Evento Detectado: ${evento.type}`);

            if (evento.type === 'payment_intent.succeeded') {
                const paymentIntent = evento.data.object;
                const reservaId = paymentIntent.metadata.reserva_id;
                const usuarioId = paymentIntent.metadata.usuario_id;
                console.log(`Procesando Pago Exitoso para Reserva #${reservaId}...`);

                const cargos = await stripe.charges.list({ payment_intent: paymentIntent.id });
                const receiptUrl = cargos.data.length > 0 ? cargos.data[0].receipt_url : null;
                
                const stripeReceipts = [{
                    type: 'payment',
                    amount: (paymentIntent.amount / 100).toFixed(2),
                    date: new Date().toISOString().slice(0, 19).replace('T', ' '),
                    description: 'Pago Original (Checkout)',
                    url: receiptUrl
                }];

                const resUpdate = await conexionBD.query(`
                    UPDATE reservations 
                    SET payment_status = 'paid', 
                        status = 'Confirmada', 
                        paid_at = NOW(), 
                        stripe_receipt_url = $1, 
                        stripe_receipts = $2, 
                        stripe_session_id = $3 
                    WHERE id = $4 
                    RETURNING id
                `, [receiptUrl, JSON.stringify(stripeReceipts), paymentIntent.id, parseInt(reservaId)]);

                if (resUpdate.rowCount > 0) {
                    console.log(`Reserva ${reservaId} actualizada a 'Confirmada' en BD.`);
                } else {
                    console.error(`No se encontró la reserva ${reservaId} para actualizar.`);
                }
                const resUser = await conexionBD.query('SELECT assigned_manager_id, name FROM users WHERE id = $1', [usuarioId]);
                const gestorId = resUser.rows[0]?.assigned_manager_id;
                const userName = resUser.rows[0]?.name;

                if (gestorId) {
                    await conexionBD.query(`
                        INSERT INTO tasks (assigned_gestor_id, created_by, title, description, type, status, priority, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, 'passport', 'Pendiente', 'alta', NOW(), NOW())
                    `, [gestorId, usuarioId, `Validar Pasaporte: ${userName}`, `Revisar documentación y Stellar Passport para la reserva #${reservaId}`]);
                    await conexionBD.query(`
                        INSERT INTO tasks (assigned_gestor_id, created_by, title, description, type, status, priority, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, 'training', 'Pendiente', 'media', NOW(), NOW())
                    `, [gestorId, usuarioId, `Coordinar Training: ${userName}`, `Iniciar protocolos de entrenamiento físico para la misión #${reservaId}`]);
                }

                console.log(`Reserva ${reservaId} confirmada y tareas asignadas al gestor ${gestorId}.`);
            }

            respuesta.json({ recibido: true });
        } catch (error) {
            console.error('Error en Webhook:', error);
            respuesta.status(400).send(`Webhook Error: ${error.message}`);
        }
    }
};

module.exports = paymentController;
