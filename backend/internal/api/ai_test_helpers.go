package api

import "sigma/internal/ai"

func encryptForKey(secret, key string) (string, error) {
	return ai.EncryptAPIKey(secret, key)
}
