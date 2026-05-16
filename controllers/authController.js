const conexionBD = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const authController = {
    
    async register(pedido, respuesta) {
        const nombre = pedido.body.nombre || pedido.body.name;
        const email = pedido.body.email;
        const password = pedido.body.password;
        const apellido1 = pedido.body.apellido1 || pedido.body.primarylastname;
        const apellido2 = pedido.body.apellido2 || pedido.body.secondarylastname || "";
        try {
            const usuarioExistente = await conexionBD.query('SELECT * FROM users WHERE email = $1', [email]);
            if (usuarioExistente.rowCount > 0) return respuesta.status(400).json({ mensaje: 'El correo electrónico ya está registrado' });
            const sal = await bcrypt.genSalt(10);
            const passwordHasheada = await bcrypt.hash(password, sal);

            // Buscar al gestor/admin con menos clientes asignados
            const consultaGestor = `
                SELECT u.id 
                FROM users u 
                LEFT JOIN users c ON c.assigned_manager_id = u.id 
                WHERE u.role IN ('gestor', 'admin') 
                GROUP BY u.id 
                ORDER BY COUNT(c.id) ASC 
                LIMIT 1
            `;
            const resGestor = await conexionBD.query(consultaGestor);
            const gestorId = resGestor.rowCount > 0 ? resGestor.rows[0].id : null;

            const consulta = `
                INSERT INTO users (name, email, password, primarylastname, secondarylastname, role, assigned_manager_id, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                RETURNING id, name, email
            `;
            const valores = [nombre, email, passwordHasheada, apellido1, apellido2, 'cliente', gestorId];
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
            
            // Generamos un token aleatorio de 6 dígitos para la recuperación de contraseña
            const token = Math.floor(100000 + Math.random() * 900000).toString();
            const expiracion = new Date();
            expiracion.setHours(expiracion.getHours() + 1); // 1 hora de validez

            await conexionBD.query(
                'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE email = $3',
                [token, expiracion, email]
            );

            // Esto es solo simulación
            //Realmente aquí deberías enviar un correo electrónico al usuario con el token de recuperación
            console.log(`[IRIS AUTH] Token de recuperación para ${email}: ${token}`);
            
            respuesta.json({ 
                mensaje: 'Se ha enviado un código de recuperación a su correo electrónico.',
                debug_token: token 
            });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al procesar la solicitud' });
        }
    },

    async resetPassword(pedido, respuesta) {
        const { email, token, newPassword } = pedido.body;
        try {
            const resultado = await conexionBD.query(
                'SELECT * FROM users WHERE email = $1 AND reset_password_token = $2 AND reset_password_expires > NOW()',
                [email, token]
            );

            if (resultado.rowCount === 0) return respuesta.status(400).json({ mensaje: 'Código inválido o expirado' });

            const sal = await bcrypt.genSalt(10);
            const passwordHasheada = await bcrypt.hash(newPassword, sal);

            await conexionBD.query(
                'UPDATE users SET password = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE email = $2',
                [passwordHasheada, email]
            );

            respuesta.json({ mensaje: 'Contraseña restablecida con éxito' });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al restablecer la contraseña' });
        }
    }
};

module.exports = authController;
