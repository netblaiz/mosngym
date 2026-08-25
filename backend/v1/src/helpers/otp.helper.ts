import { randomBytes } from 'crypto'
import { TOTP } from 'otplib'

export const generateTOTPSecret = (): string => {
  const buffer = randomBytes(20)
  return buffer.toString('hex')
}

export const generateTOTPToken = async (secret: string): Promise<string> => {
  const totp = new TOTP({
    digits: 6
  });
  return totp.generate({ secret });
}

