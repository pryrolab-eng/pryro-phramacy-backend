import { Injectable } from "@nestjs/common";
import { createHmac } from "crypto";

export interface PhoneValidationResult {
  raw: string;
  formatted: string;
  countryCode: string;
  nationalNumber: string;
  carrier?: string;
  isValid: boolean;
}

export interface CardValidationResult {
  number: string;
  maskedNumber: string;
  brand: string;
  isValid: boolean;
  expiryMonth?: string;
  expiryYear?: string;
  cvv?: string;
  holderName?: string;
}

const RWANDA_CARRIERS: Record<string, string> = {
  "788": "MTN", "789": "MTN", "790": "MTN", "791": "MTN", "792": "MTN",
  "793": "MTN", "794": "MTN", "795": "MTN", "796": "MTN", "797": "MTN",
  "798": "MTN", "799": "MTN",
  "783": "Airtel", "784": "Airtel", "785": "Airtel", "786": "Airtel", "787": "Airtel",
};

const CARD_PATTERNS: Record<string, RegExp> = {
  visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
  mastercard: /^5[1-5][0-9]{14}$/,
  amex: /^3[47][0-9]{13}$/,
  discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/,
};

@Injectable()
export class ValidationService {
  validatePhone(phoneNumber: string): PhoneValidationResult {
    const cleaned = phoneNumber.replace(/[\s\-\(\)]/g, "");
    let formatted = cleaned;

    if (cleaned.startsWith("+250")) {
      formatted = cleaned;
    } else if (cleaned.startsWith("250")) {
      formatted = "+" + cleaned;
    } else if (cleaned.startsWith("0") && cleaned.length === 10) {
      formatted = "+250" + cleaned.substring(1);
    } else if (cleaned.length === 9) {
      formatted = "+250" + cleaned;
    }

    const match = formatted.match(/^\+250([0-9]{9})$/);
    if (!match) {
      return { raw: phoneNumber, formatted: "", countryCode: "", nationalNumber: "", isValid: false };
    }

    const nationalNumber = match[1]!;
    const prefix = nationalNumber.substring(0, 3);
    const carrier = RWANDA_CARRIERS[prefix] ?? "Unknown";

    return { raw: phoneNumber, formatted, countryCode: "+250", nationalNumber, carrier, isValid: true };
  }

  validateCard(
    cardNumber: string,
    expiryMonth?: string,
    expiryYear?: string,
    cvv?: string,
    holderName?: string,
  ): CardValidationResult {
    const cleaned = cardNumber.replace(/[\s\-]/g, "");
    const isLuhnValid = this.luhnCheck(cleaned);
    const brand = this.detectCardBrand(cleaned);
    const masked = this.maskCard(cleaned);

    if (!isLuhnValid) {
      return { number: "", maskedNumber: masked, brand: "unknown", isValid: false };
    }

    const base: CardValidationResult = { number: cleaned, maskedNumber: masked, brand, isValid: true };

    if (!expiryMonth && !expiryYear && !cvv && !holderName) {
      return base;
    }

    const isExpiryValid = this.validateExpiry(expiryMonth ?? "", expiryYear ?? "");
    const isCvvValid = this.validateCvv(cvv ?? "", brand);
    const isNameValid = (holderName ?? "").trim().length >= 2;

    return {
      ...base,
      expiryMonth,
      expiryYear,
      cvv: (cvv ?? "").replace(/./g, "*"),
      holderName,
      isValid: isLuhnValid && isExpiryValid && isCvvValid && isNameValid,
    };
  }

  private luhnCheck(cardNumber: string): boolean {
    let sum = 0;
    let alternate = false;
    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let n = parseInt(cardNumber.charAt(i), 10);
      if (alternate) {
        n *= 2;
        if (n > 9) n = (n % 10) + 1;
      }
      sum += n;
      alternate = !alternate;
    }
    return sum % 10 === 0;
  }

  private detectCardBrand(cardNumber: string): string {
    for (const [brand, pattern] of Object.entries(CARD_PATTERNS)) {
      if (pattern.test(cardNumber)) return brand;
    }
    return "unknown";
  }

  private maskCard(cardNumber: string): string {
    if (cardNumber.length < 4) return cardNumber;
    return "*".repeat(cardNumber.length - 4) + cardNumber.slice(-4);
  }

  private validateExpiry(month: string, year: string): boolean {
    const now = new Date();
    const expMonth = parseInt(month, 10);
    const expYear = parseInt(year, 10);
    if (expMonth < 1 || expMonth > 12) return false;
    if (expYear < now.getFullYear()) return false;
    if (expYear === now.getFullYear() && expMonth < now.getMonth() + 1) return false;
    return true;
  }

  private validateCvv(cvv: string, brand: string): boolean {
    if (brand === "amex") return /^[0-9]{4}$/.test(cvv);
    return /^[0-9]{3}$/.test(cvv);
  }
}
