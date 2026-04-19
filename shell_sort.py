#!/usr/bin/env python3
"""
Shell Sort Algorithm Implementation
==================================

Shell sort is a generalization of insertion sort that allows
the exchange of items that are far apart. The method starts by
sorting pairs of elements far apart from each other, then progressively
reduces the gap between elements to be compared.

Time Complexity: O(n²) worst case, but typically faster than insertion sort
Space Complexity: O(1) - in-place sorting
"""

import time


class ShellSort:
    """Shell Sort implementation with multiple options."""
    
    def __init__(self):
        pass
    
    @staticmethod
    def gap_sequence(n):
        """Generate various gap sequences for different implementations."""
        # Hibbard's sequence: 2^k - 1 (3, 5, 7, 9...)
        hibbard = [2**k - 1 for k in range(1, 6) if 2**k - 1 <= n // 2]
        
        # Knuth's sequence: h_(i+1) = 3*h_i + 1 (1, 4, 13, 40...)
        knuth = []
        h = 1
        while h <= n // 3:
            h = 3 * h + 1
            knuth.insert(0, h)
        
        # Shell's original sequence
        shell_original = [7, 5, 3, 1]
        
        # Sedgewick sequence (partial)
        sedgewick = [49, 23, 10, 4, 1] if n >= 49 else []
        
        return {
            'shell_original': shell_original,
            'knuth': knuth,
            'hibbard': hibbard
        }
    
    def simple_sort(self, arr):
        """
        Simple Shell Sort - returns sorted array without step-by-step output.
        Uses Knuth's gap sequence (1, 4, 13, 40...)
        """
        n = len(arr)
        if n <= 1:
            return arr.copy()
        
        # Generate gap sequence
        gaps = []
        h = 1
        while h <= n // 3:
            h = 3 * h + 1
            gaps.append(h)
        gaps.reverse()  # Sort gaps in descending order
        
        for gap in gaps:
            if gap == 0:
                break
            
            for i in range(gap, n):
                current = arr[i]
                j = i
                while j >= gap and arr[j - gap] > current:
                    arr[j] = arr[j - gap]
                    j -= gap
                arr[j] = current
        
        return arr.copy()
    
    def sort_with_steps(self, arr):
        """
        Shell Sort with detailed step-by-step visualization.
        Shows each iteration and swap operation.
        """
        if len(arr) <= 1:
            return [arr[0]]
        
        n = len(arr)
        original = arr.copy()
        result = arr.copy()
        steps = []
        
        # Generate gap sequence
        gaps = self.gap_sequence(n)['knuth']
        gaps.reverse()  # Sort descending
        
        for gap in gaps:
            if gap == 0:
                break
            
            step_info = {
                'gap': gap,
                'array_before': result.copy(),
                'operations': []
            }
            
            # Gap insertion sort
            for i in range(gap, n):
                current = result[i]
                j = i
                while j >= gap and result[j - gap] > current:
                    result[j] = result[j - gap]
                    j -= gap
                    step_info['operations'].append(
                        f"Move {result[j]} (at idx {j}) left by {gap}"
                    )
                if j != i:
                    result[j] = current
            
            step_info['array_after'] = result.copy()
            steps.append(step_info)
        
        return {
            'original': original,
            'sorted': result,
            'steps': steps,
            'gap_sequence_used': gaps
        }
    
    def sort_with_print(self, arr):
        """
        Shell Sort with console output for interactive debugging.
        Prints each gap iteration and array state.
        """
        n = len(arr)
        print(f"\n{'='*60}")
        print(f"Shell Sort - Original Array: {arr}")
        print(f"{'='*60}\n")
        
        result = arr.copy()
        steps = []
        
        gaps = self.gap_sequence(n)['knuth']
        gaps.reverse()
        
        for gap in gaps:
            if gap == 0:
                break
            
            print(f"--- GAP: {gap} ---")
            print("Before this gap iteration:", result)
            
            for i in range(gap, n):
                current = result[i]
                j = i
                while j >= gap and result[j - gap] > current:
                    result[j] = result[j - gap]
                    j -= gap
                if j != i:
                    result[j] = current
            
            print("After this gap iteration:", result)
            steps.append({'gap': gap, 'array': result.copy()})
        
        print(f"\n{'='*60}")
        print(f"FINAL SORTED ARRAY: {result}")
        print(f"{'='*60}\n")
        return result
    
    def benchmark(self, arr):
        """
        Benchmark the algorithm with different array sizes.
        """
        import random
        n_sizes = [100, 500, 1000]
        results = {}
        
        for size in n_sizes:
            # Generate random array
            test_arr = [random.randint(1, 10**6) for _ in range(size)]
            
            start = time.time()
            sorted_arr = self.simple_sort(test_arr.copy())
            elapsed = time.time() - start
            
            results[size] = {
                'original': test_arr[:5],  # First 5 elements
                'sorted': sorted_arr[:5],
                'time_seconds': round(elapsed, 4)
            }
        
        return results


# ==================== DEMONSTRATION ====================
if __name__ == "__main__":
    sorter = ShellSort()
    
    # Test Case 1: Small random array
    print("\n" + "="*70)
    print("DEMO 1: Small Array")
    print("="*70)
    arr1 = [5, 2, 9, 1, 5, 6, 3, 8, 4, 7]
    result1 = sorter.sort_with_print(arr1)
    
    # Test Case 2: Medium random array with steps
    print("\n" + "="*70)
    print("DEMO 2: Medium Array (Step-by-Step Output)")
    print("="*70)
    arr2 = [64, 34, 25, 12, 22, 11, 90]
    details2 = sorter.sort_with_steps(arr2)
    
    print("\nGap Sequence Used:", details2['gap_sequence_used'])
    for i, step in enumerate(details2['steps'], 1):
        print(f"\nStep {i} (Gap: {step['gap']}):", step['array'])
    
    # Test Case 3: Already sorted array
    print("\n" + "="*70)
    print("DEMO 3: Already Sorted Array")
    print("="*70)
    arr3 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    result3 = sorter.simple_sort(arr3)
    print(f"Input:  {arr3}")
    print(f"Output: {result3}")
    
    # Test Case 4: Reverse sorted array
    print("\n" + "="*70)
    print("DEMO 4: Reverse Sorted Array")
    print("="*70)
    arr4 = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
    result4 = sorter.simple_sort(arr4)
    print(f"Input:  {arr4}")
    print(f"Output: {result4}")
    
    # Test Case 5: Single element
    print("\n" + "="*70)
    print("DEMO 5: Single Element Array")
    print("="*70)
    arr5 = [42]
    result5 = sorter.simple_sort(arr5)
    print(f"Input:  {arr5}")
    print(f"Output: {result5}")
    
    # Test Case 6: Empty array
    print("\n" + "="*70)
    print("DEMO 6: Empty Array")
    print("="*70)
    arr6 = []
    result6 = sorter.simple_sort(arr6)
    print(f"Input:  {arr6}")
    print(f"Output: {result6}")
    
    # Test Case 7: Gap sequence demonstration
    print("\n" + "="*70)
    print("DEMO 7: Available Gap Sequences")
    print("="*70)
    n = 25
    sequences = sorter.gap_sequence(n)
    for name, seq in {'Knuth': sequences['knuth'], 
                      'Hibbard': sequences['hibbard']}.items():
        if seq:
            print(f"{name} Sequence (for n={n}): {seq}")
    
    # Test Case 8: Benchmark
    print("\n" + "="*70)
    print("DEMO 8: Performance Benchmark")
    print("="*70)
    benchmarks = sorter.benchmark([10, 20, 50])  # Generate smaller arrays for demo
    for size, data in benchmarks.items():
        print(f"Array Size {size}: Time = {data['time_seconds']}s")