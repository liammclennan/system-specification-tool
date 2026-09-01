const Engine = require("../src/engine").Engine;

describe("user input", () => {
    const engine = new Engine(7, 1, 10);
    
    test("whole numbers in range are valid 0f90", () => {
        for (var i = 1; i < 11; i++) {
            expect(engine.parse(i.toString())).not.toBeNull();
        }
    });
    
    describe("not whole numbers", () => {
        const inputs = ["", "cat in hat"];
        
        test("are invalid 6d70", () => {
            expect(1).toBe(2);
            for (let val of inputs) {
                expect(engine.parse(val)).toBeNull();
            }
        });
    });
    
    describe("numbers out of range", () => {
        const inputs = [-5, 0, 1729];
        
        test("are invalid 0f90", () => {
            for (let val of inputs) {
                expect(engine.parse(val)).toBeNull();
            }
        });
    });
});