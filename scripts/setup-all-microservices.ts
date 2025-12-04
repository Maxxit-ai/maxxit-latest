import * as fs from 'fs';
import * as path from 'path';

const rootDir = path.join(__dirname, '..');
const servicesDir = path.join(rootDir, 'services');

console.log('🚀 Setting up all microservices...\n');

// Service configurations
const services = [
  {
    name: 'signal-api',
    port: 4003,
    description: 'Maxxit Signal API Service - Handles signal generation and retrieval',
    type: 'api'
  },
  {
    name: 'trade-executor-worker',
    port: 5001,
    description: 'Maxxit Trade Execution Worker - Executes trades based on signals',
    type: 'worker'
  },
  {
    name: 'position-monitor-worker',
    port: 5002,
    description: 'Maxxit Position Monitor Worker - Monitors open positions',
    type: 'worker'
  },
  {
    name: 'tweet-ingestion-worker',
    port: 5003,
    description: 'Maxxit Tweet Ingestion Worker - Fetches tweets for signal generation',
    type: 'worker'
  },
  {
    name: 'metrics-updater-worker',
    port: 5004,
    description: 'Maxxit Metrics Updater Worker - Updates agent performance metrics',
    type: 'worker'
  },
  {
    name: 'research-signal-worker',
    port: 5005,
    description: 'Maxxit Research Signal Worker - Generates signals from research institutes',
    type: 'worker'
  }
];

// Create package.json for each service
services.forEach(service => {
  const serviceDir = path.join(servicesDir, service.name);
  const packageJsonPath = path.join(serviceDir, 'package.json');
  
  const packageJson = {
    name: `@maxxit/${service.name}`,
    version: '1.0.0',
    description: service.description,
    main: 'dist/server.js',
    scripts: service.type === 'api' 
      ? {
          dev: 'tsx watch src/server.ts',
          build: 'tsc',
          start: 'node dist/server.js'
        }
      : {
          dev: 'tsx watch src/worker.ts',
          build: 'tsc',
          start: 'node dist/worker.js'
        },
    keywords: ['microservice', service.type],
    author: 'Maxxit',
    license: 'MIT',
    dependencies: {
      '@prisma/client': '^6.16.3',
      'dotenv': '^16.3.1',
      'axios': '^1.6.2',
      ...(service.type === 'api' ? {
        'express': '^4.18.2',
        'cors': '^2.8.5',
        'zod': '^3.22.4'
      } : {})
    },
    devDependencies: {
      '@types/node': '^20.10.6',
      'tsx': '^4.7.0',
      'typescript': '^5.3.3',
      ...(service.type === 'api' ? {
        '@types/express': '^4.17.21',
        '@types/cors': '^2.8.17'
      } : {})
    }
  };
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log(`✅ Created package.json for ${service.name}`);
});

// Create tsconfig.json for each service
services.forEach(service => {
  const serviceDir = path.join(servicesDir, service.name);
  const tsconfigPath = path.join(serviceDir, 'tsconfig.json');
  
  const tsconfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      lib: ['ES2020'],
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      moduleResolution: 'node'
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist']
  };
  
  fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
  console.log(`✅ Created tsconfig.json for ${service.name}`);
});

// Create basic server/worker files
services.forEach(service => {
  const serviceDir = path.join(servicesDir, service.name);
  const srcDir = path.join(serviceDir, 'src');
  
  if (service.type === 'api') {
    // Create server.ts for API services
    const serverContent = `import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || ${service.port};

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: '${service.name}',
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

// TODO: Add your routes here

// Error handling
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('[${service.name}] Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(\`🚀 ${service.name} running on port \${PORT}\`);
  console.log(\`📊 Health check: http://localhost:\${PORT}/health\`);
});

export default app;
`;
    
    fs.writeFileSync(path.join(srcDir, 'server.ts'), serverContent);
    console.log(`✅ Created server.ts for ${service.name}`);
    
  } else {
    // Create worker.ts for worker services
    const workerContent = `import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const prisma = new PrismaClient();
const PORT = process.env.PORT || ${service.port};

// Health check server
const app = express();
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: '${service.name}',
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(\`🏥 ${service.name} health check on port \${PORT}\`);
});

// Worker logic
async function runWorker() {
  console.log(\`🚀 ${service.name} starting...\`);
  
  const INTERVAL = parseInt(process.env.WORKER_INTERVAL || '60000'); // 1 minute default
  
  setInterval(async () => {
    try {
      console.log(\`[${service.name}] Running task...\`);
      
      // TODO: Add your worker logic here
      
      console.log(\`[${service.name}] Task completed\`);
    } catch (error: any) {
      console.error(\`[${service.name}] Error:\`, error.message);
    }
  }, INTERVAL);
}

// Start worker
if (require.main === module) {
  runWorker();
}
`;
    
    fs.writeFileSync(path.join(srcDir, 'worker.ts'), workerContent);
    console.log(`✅ Created worker.ts for ${service.name}`);
  }
});

console.log('\n✅ All microservices setup complete!');
console.log('\n📋 Next steps:');
console.log('  1. cd services/<service-name>');
console.log('  2. npm install');
console.log('  3. Add your business logic');
console.log('  4. npm run dev (to test locally)');
console.log('\n🚢 Deployment:');
console.log('  - Deploy API services to Railway');
console.log('  - Deploy workers to Railway');
console.log('  - Configure environment variables');

