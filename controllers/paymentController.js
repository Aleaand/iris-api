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
        const sig = pedido.headers['stripe-signature'];
        let evento;

        try {
            evento = pedido.body;

            if (evento.type === 'payment_intent.succeeded') {
                const paymentIntent = evento.data.object;
                const reservaId = paymentIntent.metadata.reserva_id;

                await conexionBD.query(
                    'UPDATE reservations SET payment_status = $1, paid_at = NOW(), status = $2 WHERE id = $3',
                    ['paid', 'Confirmada', reservaId]
                );

                console.log(`Reserva ${reservaId} marcada como pagada.`);
            }

            respuesta.json({ recibido: true });
        } catch (error) {
            console.error('Error en Webhook:', error);
            respuesta.status(400).send(`Webhook Error: ${error.message}`);
        }
    }
};

module.exports = paymentController;
