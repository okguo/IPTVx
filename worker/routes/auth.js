import { createUser, loginUser, AuthError } from '../services/auth.js';

export async function handleRegister(request, env) {
  try {
    const body = await request.json();
    if (!body.email || !body.password) {
      return Response.json({ error: 'email and password required' }, { status: 400 });
    }
    const result = await createUser(env, body);
    return Response.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function handleLogin(request, env) {
  try {
    const body = await request.json();
    const result = await loginUser(env, body);
    return Response.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
