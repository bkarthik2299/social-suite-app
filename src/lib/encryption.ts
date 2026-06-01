import CryptoJS from 'crypto-js';

// Browser-side vault encryption is a compatibility layer. Production should move
// to a per-user key or server-assisted envelope encryption before storing secrets.
const configuredMasterKey = import.meta.env.VITE_VAULT_ENCRYPTION_KEY || '';
const localDevelopmentKey = import.meta.env.DEV ? 'local-development-vault-key' : '';
const LEGACY_MASTER_KEYS = ['social-suite-vault-secret-key-2024', 'social-suite-hub-vault-secret-key-2024'];

const getMasterKey = () => {
    const key = configuredMasterKey || localDevelopmentKey;
    if (!key) {
        throw new Error('VITE_VAULT_ENCRYPTION_KEY is required for Password Vault encryption.');
    }
    return key;
};

/**
 * Encrypts a plain text password (or any string) using AES.
 */
export const encryptString = (plainText: string): string => {
    if (!plainText) return '';
    try {
        return CryptoJS.AES.encrypt(plainText, getMasterKey()).toString();
    } catch (e) {
        console.error("Encryption failed:", e);
        throw new Error('Password Vault encryption failed.');
    }
};

/**
 * Decrypts an AES encrypted string back to plain text.
 */
export const decryptString = (encryptedText: string): string => {
    if (!encryptedText) return '';
    try {
        const activeKey = configuredMasterKey || localDevelopmentKey;
        const candidateKeys = [activeKey, ...LEGACY_MASTER_KEYS].filter(Boolean);

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
