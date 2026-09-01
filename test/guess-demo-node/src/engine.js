class Engine {
    constructor(answer, min, max) {
        this.answer = answer;
        this.min = min;
        this.max = max;
    }
    
    parse(input) {
        const result = parseInt(input, 10);
        return isNaN(result)
            ? null
            : result >= this.min && result <= this.max
                ? result
                : null;
    }
    
    evaluate(guess) {
        if (guess === this.answer) {
            return "Correct!";
        }
        
        if (guess < this.answer) {
            return "Higher";
        }
        
        if (guess > this.answer) {
            return "Lower";
        }
        
        throw new Error("Unreachable");
    }
}

module.exports.Engine = Engine;