import { UnauthorizedException } from '@nestjs/common';
import { AppController } from './app.controller';

describe('AppController', () => {
  it('rejects private access without a lab user header', () => {
    const controller = new AppController();

    expect(() => controller.getPrivate()).toThrow(UnauthorizedException);
  });

  it('increments only its harmless in-memory counter', () => {
    const controller = new AppController();

    expect(controller.transfer({ amount: 2 })).toEqual({ amount: 2, labCounter: 2 });
    expect(controller.transfer({ amount: 3 })).toEqual({ amount: 3, labCounter: 5 });
  });
});
