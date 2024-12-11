const { Client } = require("pg");
const  AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const DATABASE_URL = "postgresql://nextvul:nextvul123@103.191.92.126:5433/fatkid";

const s3 = new AWS.S3({
    // accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    // secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: "auto",
    endpoint: process.env.ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    }
});

const BUCKET_NAME = "fullstack-team";

export default async function handler(req, res) {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        console.log('🔄 Connecting to PostgreSQL...');
        await client.connect();

        const backupFileName = `fatkid_backup_${new Date().toISOString().split('T')[0]}_${Date.now()}.sql`;
        const backupFilePath = path.join(__dirname, backupFileName);

        const query = `COPY (SELECT * FROM information_schema.tables) TO STDOUT WITH (FORMAT plain)`;

        const fileStream = fs.createWriteStream(backupFilePath);

        console.log('🗄️ Starting database backup...');
        await new Promise((resolve, reject) => {
            const stream = client.query(query)

            stream.pipe(fileStream)
            stream.on("end", resolve)
            stream.on("error", reject)
        })

        console.log(`✅ Backup saved at ${backupFilePath}`);

        // Upload backup file to S3
        const fileContent = fs.readFileSync(backupFilePath)

        const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: backupFileName,
            Body: fileContent,
            ContentType: 'application/sql'
        }

        const uploadResult = await s3.upload(uploadParams).promise();

        console.log(`✅ Backup uploaded to S3: ${uploadResult.Location}`);
        res.status(200).end(`✅ Backup uploaded to S3: ${uploadResult.Location}`);
        
        // Hapus file lokal
        fs.unlinkSync(backupFilePath);
        console.log(`🧹 Temporary file deleted: ${backupFilePath}`);
        res.status(400).end(`🧹 Temporary file deleted: ${backupFilePath}`);

    } catch (error) {
        console.error('❌ Error during backup:', error);
        
    } finally {
        await client.end();
        console.log('🔄 PostgreSQL connection closed.');
        res.status(200).end('🔄 PostgreSQL connection closed.');
    }
}

cron.schedule('0 * * * *', handler);
console.log('⏰ Scheduled backup script started. Running every hour...');