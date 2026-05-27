use keyring::Entry;

const SERVICE: &str = "com.bemindlabs.liteduck";

fn entry(key: &str) -> Result<Entry, keyring::Error> {
    Entry::new(SERVICE, key)
}

/// Stores `secret` in the OS keychain under `key`.
pub fn store_secret(key: &str, secret: &str) -> Result<(), String> {
    entry(key)
        .map_err(|e| e.to_string())?
        .set_password(secret)
        .map_err(|e| e.to_string())
}

/// Retrieves the secret stored under `key`.
/// Returns `None` when no entry exists.
pub fn get_secret(key: &str) -> Result<Option<String>, String> {
    match entry(key).map_err(|e| e.to_string())?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Removes the secret stored under `key`.
/// Silently succeeds when no entry exists.
pub fn delete_secret(key: &str) -> Result<(), String> {
    match entry(key).map_err(|e| e.to_string())?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
