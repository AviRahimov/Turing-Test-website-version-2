// utils.js

/**
 * Verifies access to restricted pages.
 * @param {string} role - The role of the user ('tester' or 'experimenter').
 * @param {string} code - The unique code generated after chatting.
 * @returns {Promise<boolean>} - Resolves to true if access is granted, false otherwise.
 */
export const verifyAccess = async (role, code) => {
  try {
    // API call to verify access
    const response = await fetch(`/api/verify_access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, code }),
    });

    const result = await response.json();
    return result.status === 'success'; // Access granted only if status is 'success'
  } catch (error) {
    console.error('Error verifying access:', error);
    return false; // Default to denying access in case of errors
  }
};
