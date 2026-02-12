const http = require('http');

function post(path, data, cookie) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookie || ''
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body), headers: res.headers }));
        });

        req.on('error', reject);
        req.write(JSON.stringify(data));
        req.end();
    });
}

function get(path, cookie) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'GET',
            headers: {
                'Cookie': cookie || ''
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body), headers: res.headers }));
        });

        req.on('error', reject);
        req.end();
    });
}

async function test() {
    try {
        console.log("1. Checking Status...");
        const status = await get('/api/auth/status');
        console.log("Status:", status.body);

        if (status.body.needsSetup || status.body.superAdmin) {
            console.log("\n2. Setup Super Admin...");
            const setupObj = { phone: '0634969565', password: 'admin', is_setup: true };
            const login = await post('/api/auth/login', setupObj);
            console.log("Setup Login:", login.body);

            const cookie = login.headers['set-cookie'] ? login.headers['set-cookie'][0].split(';')[0] : null;

            if (login.body.success && cookie) {
                console.log("\n3. Verify Access (List Admins)...");
                const admins = await get('/api/admin/users', cookie);
                console.log("Admins List:", admins.body);

                console.log("\n4. Create New Admin...");
                const newAdmin = await post('/api/admin/users', { phone: '0999999999', password: '123', role: 'ADMIN' }, cookie);
                console.log("Create Admin:", newAdmin.body);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

test();
