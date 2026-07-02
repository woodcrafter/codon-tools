declare module "multer";

declare namespace Express {
  interface Request {
    file?: {
      originalname: string;
      buffer: Buffer;
    };
  }
}

