const conexionBD = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const authController = {
    
    async register(pedido, respuesta) {
        const { nombre, email, password, apellido1, apellido2 } = pedido.body;
        try {
            const usuarioExistente = await conexionBD.query('SELECT * FROM users WHERE email = $1', [email]);
            if (usuarioExistente.rowCount > 0) return respuesta.status(400).json({ mensaje: 'El correo electrónico ya está registrado' });
            const sal = await bcrypt.genSalt(10);
            const passwordHasheada = await bcrypt.hash(password, sal);
            const consulta = `
                INSERT INTO users (name, email, password, primarylastname, secondarylastname, role, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                RETURNING id, name, email
            `;
            const valores = [nombre, email, passwordHasheada, apellido1, apellido2, 'cliente'];
            const nuevoUsuario = await conexionBD.query(consulta, valores);
            respuesta.status(201).json({ mensaje: 'Registro exitoso', usuario: nuevoUsuario.rows[0] });
        } catch (error) {
            console.error('Error en registro:', error);
            respuesta.status(500).json({ mensaje: 'Error al procesar el registro' });
        }
    },

    async login(pedido, respuesta) {
        const { email, password } = pedido.body;
        try {
            const resultado = await conexionBD.query('SELECT * FROM users WHERE email = $1', [email]);
            if (resultado.rowCount === 0) return respuesta.status(401).json({ mensaje: 'Credenciales inválidas' });
            const usuario = resultado.rows[0];
            if (usuario.role !== 'cliente') return respuesta.status(403).json({ mensaje: 'Acceso restringido a este portal' });
            const passwordCorrecta = await bcrypt.compare(password, usuario.password);
            if (!passwordCorrecta) return respuesta.status(401).json({ mensaje: 'Credenciales inválidas' });
            const token = jwt.sign(
                { id: usuario.id, email: usuario.email, role: usuario.role },
                process.env.JWT_SECRET || 'iris_secreto_espacial',
                { expiresIn: '24h' }
            );
            respuesta.json({ mensaje: 'Login exitoso', token: token, usuario: { id: usuario.id, nombre: usuario.name, email: usuario.email } });
        } catch (error) {
            console.error('Error en login:', error);
            respuesta.status(500).json({ mensaje: 'Error al procesar el inicio de sesión' });
        }
    },

    async logout(pedido, respuesta) {
        // En JWT el logout se suele manejar en el cliente (borrando el token)
        // Pero devolvemos una respuesta de éxito
        respuesta.json({ mensaje: 'Cierre de sesión exitoso. Por favor, elimine el token de su almacenamiento local.' });
    },

    async forgotPassword(pedido, respuesta) {
        const { email } = pedido.body;
        try {
            const resultado = await conexionBD.query('SELECT * FROM users WHERE email = $1', [email]);
            if (resultado.rowCount === 0) return respuesta.status(404).json({ mensaje: 'No existe un usuario con ese correo' });
            
            // Aqui iria la logica para enviar un correo con un token de recuperacion
            respuesta.json({ mensaje: 'Si el correo existe, se ha enviado un enlace para restablecer la contraseña.' });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al procesar la solicitud' });
        }
    }
};

module.exports = authController;
