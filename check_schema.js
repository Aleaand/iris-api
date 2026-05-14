const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres@localhost:5432/iris_db'
});

async function checkSchema() {
  await client.connect();
  const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
  console.log(res.rows.map(r => r.column_name));
  await client.end();
}

checkSchema();
