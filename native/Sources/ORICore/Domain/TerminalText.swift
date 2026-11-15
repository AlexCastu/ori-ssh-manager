import Foundation

public enum TerminalText {
    public static func lastBlock(_ text: String) -> String {
        let lines = text.components(separatedBy: .newlines)
        let pattern = #"(?:[\w.-]+@[\w.-]+.*?|^\s*[A-Za-z]:\\.*?|^\s*PS\s.*?)[$#%>]"#
        let candidates = lines.indices.filter {
            lines[$0].range(of: pattern, options: .regularExpression) != nil
        }
        guard let last = candidates.last else {
            return text.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let bare = lines[last].range(of: #"[$#%>]\s*$"#, options: .regularExpression) != nil
        let start = bare && candidates.count > 1 ? candidates[candidates.count - 2] : last
        let end = bare && candidates.count > 1 ? last : lines.count
        return lines[start..<end].joined(separator: "\n").trimmingCharacters(
            in: .whitespacesAndNewlines)
    }
    public static func fuzzyScore(_ query: String, in text: String) -> Int? {
        let query = Array(query.lowercased())
        let text = Array(text.lowercased())
        var index = 0
        var score = 0
        var previous = -2
        for i in text.indices where index < query.count {
            guard text[i] == query[index] else { continue }
            score +=
                1 + (previous == i - 1 ? 2 : 0)
                + (i == 0 || " @:._/-".contains(text[i - 1]) ? 3 : 0)
            index += 1
            previous = i
        }
        return index == query.count ? score : nil
    }
}
