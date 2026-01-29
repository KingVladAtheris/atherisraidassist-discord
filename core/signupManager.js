const { Signup } = require("../signup");

export async function handleSignupSubmit({ raid, userId, charName }) {
  raid.signups.set(
    userId,
    new Signup({
      userId,
      charName,
      className: null,
      spec: null,
      status: 'attend',
    })
  );

  return true;
}

export async function handleSignupSelect({ raid, userId, field, value }) {
  const signup = raid.signups.get(userId);
  if (!signup) return false;

  signup[field] = value;
  return true;
}
