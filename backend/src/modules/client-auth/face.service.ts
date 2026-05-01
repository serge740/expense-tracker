import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import * as path from 'path';

let faceapi: any;
let tf: any;
let Jimp: any;

@Injectable()
export class FaceService implements OnModuleInit {
  private modelsLoaded = false;

  async onModuleInit() {
    await this.loadModels();
  }

  private async loadModels() {
    if (this.modelsLoaded) return;
    try {
      // node-wasm build bundles TF.js + WASM backend — no tfjs-node required
      faceapi = await import('@vladmandic/face-api/dist/face-api.node-wasm.js');
      tf = faceapi.tf;
      Jimp = (await import('jimp')).Jimp;

      await tf.setBackend('wasm');
      await tf.ready();

      const modelPath = path.join(
        process.cwd(),
        'node_modules/@vladmandic/face-api/model',
      );
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);

      this.modelsLoaded = true;
      console.log('[FaceService] Models loaded (WASM backend)');
    } catch (err) {
      console.error('[FaceService] Failed to load models:', err);
    }
  }

  private async bufferToTensor(imageBuffer: Buffer): Promise<any> {
    const image = await Jimp.read(imageBuffer);
    const { width, height } = image.bitmap;
    const pixels = new Uint8Array(width * height * 3);
    let idx = 0;
    image.scan(0, 0, width, height, (_x: number, _y: number, offset: number) => {
      pixels[idx++] = image.bitmap.data[offset];
      pixels[idx++] = image.bitmap.data[offset + 1];
      pixels[idx++] = image.bitmap.data[offset + 2];
    });
    return tf.tensor3d(pixels, [height, width, 3]);
  }

  async extractDescriptor(imageBuffer: Buffer): Promise<number[] | null> {
    if (!this.modelsLoaded) await this.loadModels();
    if (!faceapi || !tf) throw new BadRequestException('Face recognition service not ready');

    const tensor = await this.bufferToTensor(imageBuffer);
    try {
      const detection = await faceapi
        .detectSingleFace(tensor)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) return null;
      return Array.from(detection.descriptor);
    } finally {
      tensor.dispose();
    }
  }

  computeDistance(stored: number[], submitted: number[]): number {
    if (!faceapi) return Infinity;
    return faceapi.euclideanDistance(stored, submitted);
  }

  isMatch(stored: number[], submitted: number[], threshold = 0.5): boolean {
    const distance = this.computeDistance(stored, submitted);
    console.log(`[FaceService] distance=${distance.toFixed(4)}`);
    return distance <= threshold;
  }
}
