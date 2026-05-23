import CryptoJS from 'crypto-js';

// IMPORTANT: In a production app, the MASTER_KEY should not be hardcoded in the primary bundle,
// or it should be derived from a user's master password input that is never stored.
// For this migration phase, we use an environment variable or a fallback string to implement the strategy.
const MASTER_KEY = import.meta.env.VITE_VAULT_ENCRYPTION_KEY || 'social-suite-vault-secret-key-2024';
const LEGACY_MASTER_KEYS = ['social-suite-hub-vault-secret-key-2024'];

/**
 * Encrypts a plain text password (or any string) using AES.
 */
export const encryptString = (plainText: string): string => {
    if (!plainText) return '';
    try {
        return CryptoJS.AES.encrypt(plainText, MASTER_KEY).toString();
    } catch (e) {
        console.error("Encryption failed:", e);
        return plainText; // Fallback in case of failure, though in prod should throw.
    }
};

/**
 * Decrypts an AES encrypted string back to plain text.
 */
export const decryptString = (encryptedText: string): string => {
    if (!encryptedText) return '';
    try {
        const candidateKeys = [MASTER_KEY, ...LEGACY_MASTER_KEYS];

        for (const key of candidateKeys) {
            const bytes = CryptoJS.AES.decrypt(encryptedText, key);
            const originalText = bytes.toString(CryptoJS.enc.Utf8);

            if (originalText) {
                return originalText;
            }
        }

        // If decryption fails due to a wrong key, originalText could be empty.
        // To prevent blanking out legacy unencrypted data, return the original text if decrypting gives empty.
        // A better approach is to use a specific prefix to denote encrypted data (e.g. "enc:")
        return encryptedText;
    } catch (e) {
        // If it throws, it means it's likely not AES encrypted or malformed, return raw for backward compatibility.
        return encryptedText;
    }
};
