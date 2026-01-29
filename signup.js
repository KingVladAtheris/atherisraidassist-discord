export class Signup {
  constructor({ userId, charName, className, spec, status }) {
    this.userId = userId;
    this.name = charName;
    this.className = className;
    this.spec = spec;        // "Tank" | "Healer" | "DPS"
    this.status = status || 'attend';    // "attend" | "maybe" | "absent"
    this.reserves = [];      // array of {id: number, name: string}
  }
}