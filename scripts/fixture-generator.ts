#!/usr/bin/env tsx

import { faker } from '@faker-js/faker';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types
interface GeneratorOptions {
  schema: string;
  count: number;
  output?: string;
  seed?: number;
  related?: boolean;
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  pretty?: boolean;
}

const SIZE_PRESETS = {
  small: 100,
  medium: 1000,
  large: 10000,
  xlarge: 100000,
};

// Base factory class
abstract class DataFactory<T> {
  protected faker = faker;

  constructor(seed?: number) {
    if (seed !== undefined) {
      this.faker.seed(seed);
    }
  }

  abstract generate(): T;

  generateMany(count: number): T[] {
    return Array.from({ length: count }, () => this.generate());
  }

  toJSONL(data: T[]): string {
    return data.map(item => JSON.stringify(item)).join('\n');
  }

  toPrettyJSON(data: T[]): string {
    return JSON.stringify(data, null, 2);
  }
}

// E-commerce schemas
interface Order {
  _id: string;
  customerId: number;
  orderId: string;
  items: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
    category: string;
  }>;
  totalAmount: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  orderDate: Date;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
  };
  paymentMethod: 'credit_card' | 'debit_card' | 'paypal' | 'crypto';
  priority: 'standard' | 'express' | 'overnight';
}

class OrderFactory extends DataFactory<Order> {
  private orderCounter = 1;
  private customerIds: number[] = [];

  constructor(seed?: number, customerCount: number = 100) {
    super(seed);
    this.customerIds = Array.from({ length: customerCount }, (_, i) => i + 1);
  }

  generate(): Order {
    const items = Array.from({ length: this.faker.number.int({ min: 1, max: 5 }) }, () => {
      const price = this.faker.number.float({ min: 9.99, max: 999.99, fractionDigits: 2 });
      const quantity = this.faker.number.int({ min: 1, max: 10 });
      return {
        productId: this.faker.string.uuid(),
        name: this.faker.commerce.productName(),
        price,
        quantity,
        category: this.faker.commerce.department(),
      };
    });

    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    return {
      _id: `ORD-${this.orderCounter++}`,
      customerId: this.faker.helpers.arrayElement(this.customerIds),
      orderId: this.faker.string.uuid(),
      items,
      totalAmount: Math.round(totalAmount * 100) / 100,
      status: this.faker.helpers.arrayElement(['pending', 'processing', 'shipped', 'delivered', 'cancelled']),
      orderDate: this.faker.date.recent({ days: 90 }).toISOString(),
      shippingAddress: {
        street: this.faker.location.streetAddress(),
        city: this.faker.location.city(),
        state: this.faker.location.state(),
        country: this.faker.location.country(),
        zipCode: this.faker.location.zipCode(),
      },
      paymentMethod: this.faker.helpers.arrayElement(['credit_card', 'debit_card', 'paypal', 'crypto']),
      priority: this.faker.helpers.weightedArrayElement([
        { weight: 70, value: 'standard' },
        { weight: 25, value: 'express' },
        { weight: 5, value: 'overnight' },
      ]),
    };
  }
}

interface Customer {
  _id: number;
  customerId: string;
  name: string;
  email: string;
  age: number;
  registrationDate: Date;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  totalSpent: number;
  orderCount: number;
  preferences: {
    newsletter: boolean;
    notifications: boolean;
    language: string;
  };
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
  };
  tags: string[];
}

class CustomerFactory extends DataFactory<Customer> {
  private customerCounter = 1;

  generate(): Customer {
    const orderCount = this.faker.number.int({ min: 0, max: 100 });
    const avgOrderValue = this.faker.number.float({ min: 50, max: 500 });
    const totalSpent = Math.round(orderCount * avgOrderValue * 100) / 100;

    let tier: Customer['tier'] = 'bronze';
    if (totalSpent > 10000) tier = 'platinum';
    else if (totalSpent > 5000) tier = 'gold';
    else if (totalSpent > 1000) tier = 'silver';

    return {
      _id: this.customerCounter++,
      customerId: this.faker.string.uuid(),
      name: this.faker.person.fullName(),
      email: this.faker.internet.email(),
      age: this.faker.number.int({ min: 18, max: 85 }),
      registrationDate: this.faker.date.past({ years: 3 }).toISOString(),
      tier,
      totalSpent,
      orderCount,
      preferences: {
        newsletter: this.faker.datatype.boolean(),
        notifications: this.faker.datatype.boolean(),
        language: this.faker.helpers.arrayElement(['en', 'es', 'fr', 'de', 'zh']),
      },
      address: {
        street: this.faker.location.streetAddress(),
        city: this.faker.location.city(),
        state: this.faker.location.state(),
        country: this.faker.location.country(),
        zipCode: this.faker.location.zipCode(),
      },
      tags: this.faker.helpers.arrayElements(['vip', 'frequent_buyer', 'discount_hunter', 'early_adopter', 'influencer'], { min: 0, max: 3 }),
    };
  }
}

// Blog/Content schemas
interface BlogPost {
  _id: string;
  postId: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  authorId: number;
  authorName: string;
  publishedDate: Date;
  lastModified: Date;
  status: 'draft' | 'published' | 'archived';
  category: string;
  tags: string[];
  views: number;
  likes: number;
  comments: Array<{
    commentId: string;
    userId: number;
    userName: string;
    text: string;
    timestamp: Date;
    likes: number;
  }>;
  metadata: {
    readTime: number;
    wordCount: number;
    featured: boolean;
    seoScore: number;
  };
}

class BlogPostFactory extends DataFactory<BlogPost> {
  private postCounter = 1;
  private authorIds: Array<{ id: number; name: string }> = [];

  constructor(seed?: number, authorCount: number = 20) {
    super(seed);
    this.authorIds = Array.from({ length: authorCount }, (_, i) => ({
      id: i + 1,
      name: this.faker.person.fullName(),
    }));
  }

  generate(): BlogPost {
    const wordCount = this.faker.number.int({ min: 200, max: 2000 });
    const readTime = Math.ceil(wordCount / 200);
    const author = this.faker.helpers.arrayElement(this.authorIds);
    const publishedDate = this.faker.date.past({ years: 2 });

    const comments = Array.from({ length: this.faker.number.int({ min: 0, max: 20 }) }, () => ({
      commentId: this.faker.string.uuid(),
      userId: this.faker.number.int({ min: 1, max: 1000 }),
      userName: this.faker.person.fullName(),
      text: this.faker.lorem.sentences({ min: 1, max: 3 }),
      timestamp: this.faker.date.between({ from: publishedDate, to: new Date() }).toISOString(),
      likes: this.faker.number.int({ min: 0, max: 50 }),
    }));

    const title = this.faker.lorem.sentence({ min: 3, max: 8 });

    return {
      _id: `POST-${this.postCounter++}`,
      postId: this.faker.string.uuid(),
      title,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      content: this.faker.lorem.paragraphs({ min: 3, max: 10 }),
      excerpt: this.faker.lorem.paragraph(),
      authorId: author.id,
      authorName: author.name,
      publishedDate: publishedDate.toISOString(),
      lastModified: this.faker.date.between({ from: publishedDate, to: new Date() }).toISOString(),
      status: this.faker.helpers.weightedArrayElement([
        { weight: 80, value: 'published' },
        { weight: 15, value: 'draft' },
        { weight: 5, value: 'archived' },
      ]),
      category: this.faker.helpers.arrayElement(['technology', 'business', 'lifestyle', 'travel', 'food', 'health']),
      tags: this.faker.helpers.arrayElements(['javascript', 'react', 'nodejs', 'mongodb', 'typescript', 'devops', 'cloud', 'ai', 'web3'], { min: 2, max: 5 }),
      views: this.faker.number.int({ min: 0, max: 50000 }),
      likes: this.faker.number.int({ min: 0, max: 1000 }),
      comments,
      metadata: {
        readTime,
        wordCount,
        featured: this.faker.datatype.boolean({ probability: 0.1 }),
        seoScore: this.faker.number.int({ min: 0, max: 100 }),
      },
    };
  }
}

// HR/Employee schemas
interface Employee {
  _id: number;
  employeeId: string;
  name: string;
  email: string;
  department: string;
  position: string;
  level: 'junior' | 'mid' | 'senior' | 'lead' | 'principal';
  salary: number;
  startDate: Date;
  performanceScores: number[];
  skills: string[];
  manager: string | null;
  location: {
    office: string;
    city: string;
    country: string;
    isRemote: boolean;
  };
  benefits: {
    healthInsurance: boolean;
    dentalInsurance: boolean;
    retirement401k: boolean;
    stockOptions: number;
    vacationDays: number;
  };
}

class EmployeeFactory extends DataFactory<Employee> {
  private employeeCounter = 1;
  private departments = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance', 'Operations', 'Product', 'Design'];
  private skills = ['JavaScript', 'Python', 'Java', 'React', 'Node.js', 'AWS', 'Docker', 'Kubernetes', 'SQL', 'MongoDB'];

  generate(): Employee {
    const department = this.faker.helpers.arrayElement(this.departments);
    const level = this.faker.helpers.weightedArrayElement([
      { weight: 30, value: 'junior' },
      { weight: 35, value: 'mid' },
      { weight: 20, value: 'senior' },
      { weight: 10, value: 'lead' },
      { weight: 5, value: 'principal' },
    ]);

    const baseSalary = {
      junior: 60000,
      mid: 85000,
      senior: 115000,
      lead: 140000,
      principal: 170000,
    };

    const salary = baseSalary[level] + this.faker.number.int({ min: -10000, max: 30000 });

    return {
      _id: this.employeeCounter++,
      employeeId: `EMP-${this.faker.string.alphanumeric({ length: 6, casing: 'upper' })}`,
      name: this.faker.person.fullName(),
      email: this.faker.internet.email(),
      department,
      position: this.faker.person.jobTitle(),
      level,
      salary,
      startDate: this.faker.date.past({ years: 10 }).toISOString(),
      performanceScores: Array.from({ length: 4 }, () =>
        this.faker.number.float({ min: 1, max: 10, fractionDigits: 1 })
      ),
      skills: this.faker.helpers.arrayElements(this.skills, { min: 2, max: 6 }),
      manager: this.faker.datatype.boolean({ probability: 0.85 }) ? this.faker.person.fullName() : null,
      location: {
        office: this.faker.helpers.arrayElement(['HQ', 'Branch-NY', 'Branch-SF', 'Branch-London', 'Remote']),
        city: this.faker.location.city(),
        country: this.faker.location.country(),
        isRemote: this.faker.datatype.boolean({ probability: 0.3 }),
      },
      benefits: {
        healthInsurance: this.faker.datatype.boolean({ probability: 0.95 }),
        dentalInsurance: this.faker.datatype.boolean({ probability: 0.85 }),
        retirement401k: this.faker.datatype.boolean({ probability: 0.9 }),
        stockOptions: level === 'junior' ? 0 : this.faker.number.int({ min: 100, max: 10000 }),
        vacationDays: this.faker.number.int({ min: 15, max: 30 }),
      },
    };
  }
}

// Financial transaction schemas
interface Transaction {
  _id: string;
  transactionId: string;
  accountId: string;
  userId: number;
  type: 'deposit' | 'withdrawal' | 'transfer' | 'payment' | 'fee';
  amount: number;
  currency: string;
  category: string;
  description: string;
  date: Date;
  status: 'pending' | 'completed' | 'failed' | 'reversed';
  metadata: {
    merchantName?: string;
    location?: string;
    paymentMethod?: string;
    referenceNumber: string;
  };
  balanceBefore: number;
  balanceAfter: number;
  tags: string[];
}

class TransactionFactory extends DataFactory<Transaction> {
  private transactionCounter = 1;
  private accountBalances: Map<string, number> = new Map();

  generate(): Transaction {
    const accountId = `ACC-${this.faker.string.alphanumeric({ length: 8, casing: 'upper' })}`;
    const currentBalance = this.accountBalances.get(accountId) || this.faker.number.float({ min: 1000, max: 50000, fractionDigits: 2 });

    const type = this.faker.helpers.weightedArrayElement([
      { weight: 30, value: 'payment' },
      { weight: 25, value: 'deposit' },
      { weight: 20, value: 'withdrawal' },
      { weight: 20, value: 'transfer' },
      { weight: 5, value: 'fee' },
    ]);

    const categories = {
      payment: ['groceries', 'utilities', 'entertainment', 'dining', 'shopping', 'transport'],
      deposit: ['salary', 'refund', 'interest', 'transfer'],
      withdrawal: ['atm', 'cash'],
      transfer: ['internal', 'external', 'investment'],
      fee: ['service', 'overdraft', 'maintenance'],
    };

    const isIncome = type === 'deposit';
    const amount = isIncome
      ? this.faker.number.float({ min: 100, max: 5000, fractionDigits: 2 })
      : -Math.abs(this.faker.number.float({ min: 10, max: 1000, fractionDigits: 2 }));

    const balanceAfter = Math.round((currentBalance + amount) * 100) / 100;
    this.accountBalances.set(accountId, balanceAfter);

    return {
      _id: `TXN-${this.transactionCounter++}`,
      transactionId: this.faker.string.uuid(),
      accountId,
      userId: this.faker.number.int({ min: 1, max: 1000 }),
      type,
      amount,
      currency: this.faker.helpers.arrayElement(['USD', 'EUR', 'GBP', 'JPY']),
      category: this.faker.helpers.arrayElement(categories[type]),
      description: this.faker.commerce.productDescription().substring(0, 100),
      date: this.faker.date.recent({ days: 90 }).toISOString(),
      status: this.faker.helpers.weightedArrayElement([
        { weight: 85, value: 'completed' },
        { weight: 10, value: 'pending' },
        { weight: 3, value: 'failed' },
        { weight: 2, value: 'reversed' },
      ]),
      metadata: {
        merchantName: type === 'payment' ? this.faker.company.name() : undefined,
        location: type === 'payment' ? this.faker.location.city() : undefined,
        paymentMethod: type === 'payment' ? this.faker.helpers.arrayElement(['card', 'bank', 'cash']) : undefined,
        referenceNumber: this.faker.string.alphanumeric({ length: 12, casing: 'upper' }),
      },
      balanceBefore: currentBalance,
      balanceAfter,
      tags: this.faker.helpers.arrayElements(['recurring', 'business', 'personal', 'tax-deductible', 'reimbursable'], { min: 0, max: 2 }),
    };
  }
}

// IoT sensor schemas
interface SensorReading {
  _id: string;
  deviceId: string;
  sensorType: 'temperature' | 'humidity' | 'pressure' | 'motion' | 'light' | 'co2';
  timestamp: Date;
  value: number;
  unit: string;
  location: {
    building: string;
    floor: number;
    room: string;
    coordinates: {
      lat: number;
      lng: number;
    };
  };
  status: 'normal' | 'warning' | 'critical';
  metadata: {
    batteryLevel: number;
    signalStrength: number;
    firmware: string;
    calibratedAt: Date;
  };
  anomaly: boolean;
  tags: string[];
}

class SensorReadingFactory extends DataFactory<SensorReading> {
  private readingCounter = 1;
  private deviceIds: string[] = [];

  constructor(seed?: number, deviceCount: number = 50) {
    super(seed);
    this.deviceIds = Array.from({ length: deviceCount }, (_, i) =>
      `SENSOR-${this.faker.string.alphanumeric({ length: 8, casing: 'upper' })}`
    );
  }

  generate(): SensorReading {
    const sensorType = this.faker.helpers.arrayElement(['temperature', 'humidity', 'pressure', 'motion', 'light', 'co2']);

    const valueRanges = {
      temperature: { min: -10, max: 40, unit: '°C' },
      humidity: { min: 20, max: 80, unit: '%' },
      pressure: { min: 980, max: 1040, unit: 'hPa' },
      motion: { min: 0, max: 1, unit: 'boolean' },
      light: { min: 0, max: 100000, unit: 'lux' },
      co2: { min: 400, max: 2000, unit: 'ppm' },
    };

    const range = valueRanges[sensorType];
    const value = sensorType === 'motion'
      ? this.faker.datatype.boolean() ? 1 : 0
      : this.faker.number.float({ min: range.min, max: range.max, fractionDigits: 2 });

    let status: SensorReading['status'] = 'normal';
    if (sensorType === 'temperature' && (value < 10 || value > 30)) status = 'warning';
    if (sensorType === 'temperature' && (value < 0 || value > 35)) status = 'critical';
    if (sensorType === 'co2' && value > 1000) status = 'warning';
    if (sensorType === 'co2' && value > 1500) status = 'critical';

    const anomaly = status === 'critical' || this.faker.datatype.boolean({ probability: 0.05 });

    return {
      _id: `READ-${this.readingCounter++}`,
      deviceId: this.faker.helpers.arrayElement(this.deviceIds),
      sensorType,
      timestamp: this.faker.date.recent({ days: 7 }).toISOString(),
      value,
      unit: range.unit,
      location: {
        building: this.faker.helpers.arrayElement(['A', 'B', 'C']),
        floor: this.faker.number.int({ min: 1, max: 10 }),
        room: `${this.faker.number.int({ min: 100, max: 999 })}`,
        coordinates: {
          lat: this.faker.location.latitude(),
          lng: this.faker.location.longitude(),
        },
      },
      status,
      metadata: {
        batteryLevel: this.faker.number.int({ min: 10, max: 100 }),
        signalStrength: this.faker.number.int({ min: -90, max: -30 }),
        firmware: `v${this.faker.system.semver()}`,
        calibratedAt: this.faker.date.past({ years: 1 }).toISOString(),
      },
      anomaly,
      tags: anomaly ? ['alert', 'requires-attention'] : [],
    };
  }
}

// Social media schemas
interface SocialPost {
  _id: string;
  postId: string;
  userId: number;
  username: string;
  content: string;
  postType: 'text' | 'image' | 'video' | 'poll' | 'share';
  timestamp: Date;
  likes: number;
  shares: number;
  comments: number;
  hashtags: string[];
  mentions: string[];
  media?: {
    url: string;
    type: 'image' | 'video';
    duration?: number;
  };
  engagement: {
    impressions: number;
    reach: number;
    saves: number;
    clickThroughRate: number;
  };
  sentiment: 'positive' | 'neutral' | 'negative';
  isSponsored: boolean;
  location?: {
    city: string;
    country: string;
  };
}

class SocialPostFactory extends DataFactory<SocialPost> {
  private postCounter = 1;
  private usernames: string[] = [];
  private hashtags = ['tech', 'coding', 'javascript', 'webdev', 'startup', 'ai', 'machinelearning', 'cloud', 'devops', 'opensource'];

  constructor(seed?: number, userCount: number = 100) {
    super(seed);
    this.usernames = Array.from({ length: userCount }, () =>
      this.faker.internet.username()
    );
  }

  generate(): SocialPost {
    const postType = this.faker.helpers.weightedArrayElement([
      { weight: 40, value: 'text' },
      { weight: 30, value: 'image' },
      { weight: 15, value: 'video' },
      { weight: 10, value: 'share' },
      { weight: 5, value: 'poll' },
    ]);

    const likes = this.faker.number.int({ min: 0, max: 10000 });
    const shares = this.faker.number.int({ min: 0, max: Math.floor(likes / 10) });
    const comments = this.faker.number.int({ min: 0, max: Math.floor(likes / 5) });
    const impressions = likes * this.faker.number.int({ min: 10, max: 100 });

    return {
      _id: `POST-${this.postCounter++}`,
      postId: this.faker.string.uuid(),
      userId: this.faker.number.int({ min: 1, max: 1000 }),
      username: this.faker.helpers.arrayElement(this.usernames),
      content: this.faker.lorem.sentences({ min: 1, max: 5 }),
      postType,
      timestamp: this.faker.date.recent({ days: 30 }).toISOString(),
      likes,
      shares,
      comments,
      hashtags: this.faker.helpers.arrayElements(this.hashtags, { min: 1, max: 5 }),
      mentions: Array.from({ length: this.faker.number.int({ min: 0, max: 3 }) }, () =>
        `@${this.faker.helpers.arrayElement(this.usernames)}`
      ),
      media: postType === 'image' || postType === 'video' ? {
        url: this.faker.image.url(),
        type: postType as 'image' | 'video',
        duration: postType === 'video' ? this.faker.number.int({ min: 10, max: 300 }) : undefined,
      } : undefined,
      engagement: {
        impressions,
        reach: Math.floor(impressions * 0.7),
        saves: this.faker.number.int({ min: 0, max: Math.floor(likes / 20) }),
        clickThroughRate: this.faker.number.float({ min: 0.01, max: 0.15, fractionDigits: 3 }),
      },
      sentiment: this.faker.helpers.weightedArrayElement([
        { weight: 60, value: 'positive' },
        { weight: 30, value: 'neutral' },
        { weight: 10, value: 'negative' },
      ]),
      isSponsored: this.faker.datatype.boolean({ probability: 0.1 }),
      location: this.faker.datatype.boolean({ probability: 0.3 }) ? {
        city: this.faker.location.city(),
        country: this.faker.location.country(),
      } : undefined,
    };
  }
}

// Factory registry
const FACTORIES = {
  'ecommerce-orders': OrderFactory,
  'ecommerce-customers': CustomerFactory,
  'blog-posts': BlogPostFactory,
  'hr-employees': EmployeeFactory,
  'financial-transactions': TransactionFactory,
  'iot-sensors': SensorReadingFactory,
  'social-posts': SocialPostFactory,
};

// CLI setup
const program = new Command();

program
  .name('fixture-generator')
  .description('Generate test data fixtures for aggo.js')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate fixture data')
  .option('-s, --schema <type>', 'Schema type to generate', 'ecommerce-orders')
  .option('-c, --count <number>', 'Number of records to generate', '100')
  .option('-o, --output <path>', 'Output file path')
  .option('--seed <number>', 'Random seed for reproducible data')
  .option('--size <preset>', 'Size preset (small, medium, large, xlarge)')
  .option('--pretty', 'Output as pretty-printed JSON instead of JSONL')
  .option('--list-schemas', 'List available schemas')
  .action((options: GeneratorOptions & { listSchemas?: boolean }) => {
    if (options.listSchemas) {
      console.log('Available schemas:');
      Object.keys(FACTORIES).forEach(schema => {
        console.log(`  - ${schema}`);
      });
      return;
    }

    const FactoryClass = FACTORIES[options.schema as keyof typeof FACTORIES];
    if (!FactoryClass) {
      console.error(`Unknown schema: ${options.schema}`);
      console.log('Available schemas:', Object.keys(FACTORIES).join(', '));
      process.exit(1);
    }

    const count = options.size
      ? SIZE_PRESETS[options.size]
      : parseInt(options.count as unknown as string, 10);

    const seed = options.seed ? parseInt(options.seed as unknown as string, 10) : undefined;

    console.log(`Generating ${count} ${options.schema} records...`);

    const factory = new FactoryClass(seed);
    const data = factory.generateMany(count);

    const output = options.pretty
      ? factory.toPrettyJSON(data)
      : factory.toJSONL(data);

    if (options.output) {
      const outputPath = path.resolve(options.output);
      const outputDir = path.dirname(outputPath);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(outputPath, output);
      console.log(`✅ Generated ${count} records to ${outputPath}`);
    } else {
      console.log(output);
    }
  });

program
  .command('demo')
  .description('Generate demo datasets for all schemas')
  .option('--size <preset>', 'Size preset for demo data', 'small')
  .action((options: { size: string }) => {
    const fixturesDir = path.join(__dirname, '..', 'fixtures');

    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    const count = SIZE_PRESETS[options.size as keyof typeof SIZE_PRESETS] || 100;

    Object.keys(FACTORIES).forEach(schema => {
      const FactoryClass = FACTORIES[schema as keyof typeof FACTORIES];
      const factory = new FactoryClass(42); // Fixed seed for reproducibility
      const data = factory.generateMany(count);
      const output = factory.toJSONL(data);

      const filename = path.join(fixturesDir, `${schema}.jsonl`);
      fs.writeFileSync(filename, output);
      console.log(`✅ Generated ${schema} -> ${filename}`);
    });

    console.log(`\n✨ All demo fixtures generated in ${fixturesDir}`);
  });

program.parse(process.argv);