process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:5432/pharmafind_test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'testsecretkeywithminlength';
process.env.JWT_EXPIRES_IN = '1d';
